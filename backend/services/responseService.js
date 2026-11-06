const { Request, Response, Submission } = require('../models');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const { ownerFilter } = require('../utils/access');
const { assertValidId } = require('../utils/ids');
const videoStore = require('./videoStore');
const { sniffVideoFile } = require('./videoSniffer');
const { isRequestAccepting } = require('./requestService');
const { providerOf } = require('../utils/provider');
const { isFinalKey, extensionOfKey } = require('./objectKeys');

const DAY_MS = 24 * 60 * 60 * 1000;
const LINK_UNAVAILABLE = () => new AppError(404, 'This link is not available', 'LINK_UNAVAILABLE');
const NOT_FOUND = () => new AppError(404, 'Not found', 'NOT_FOUND');

const isDuplicateKeyError = (err) => Boolean(err && err.code === 11000);

// The retention deadline. Phase 5 records always have deleteAt; this falls back to submittedAt + 180 days.
function retentionDeadline(doc) {
  if (doc.deleteAt) return new Date(doc.deleteAt);
  if (doc.submittedAt) return new Date(new Date(doc.submittedAt).getTime() + config.upload.retentionDays * DAY_MS);
  return null;
}

// 'expired' as soon as the deadline passes, even before the retention job has marked the record.
function effectiveStatus(doc, now = new Date()) {
  if (doc.status === 'expired') return 'expired';
  const deadline = retentionDeadline(doc);
  if (doc.status === 'submitted' && deadline && deadline <= now) return 'expired';
  return doc.status;
}

// Metadata only. The storage key, upload key, credential hash and file path are never part of any API response.
function serializeResponse(doc, now = new Date()) {
  const status = effectiveStatus(doc, now);
  const provider = providerOf(doc);
  return {
    id: doc.id,
    ...(doc.batchId ? {batchId:doc.batchId,questionId:doc.questionId,questionText:doc.questionText} : {}),
    clientName: doc.clientName,
    clientEmail: doc.clientEmail,
    status: doc.status,
    effectiveStatus: status,
    durationSeconds: doc.durationSeconds ?? null,
    fileSize: doc.fileSize ?? null,
    mimeType: doc.mimeType || null,
    submittedAt: doc.submittedAt || null,
    createdAt: doc.createdAt,
    deleteAt: doc.deleteAt || null,
    expiredAt: doc.expiredAt || null,
    storageProvider: provider,
    // Whether the Play/Download buttons should be enabled (the server re-checks on every request).
    playable: status === 'submitted' && (provider === 's3' || (provider === 'local' && config.storage.provider === 'local')),
  };
}

// ---------- Public submission ----------

// Verifies the saved temp file really is a supported, non-empty video, stores it, then records it.
// The record is created as `submitted` only after the video file is safely in place. If anything fails after the
// file was moved, the file is removed again so no orphan is left behind.
// `file` is multer's { path, size }. The temp file itself is also removed by the upload middleware on request end.
async function submitResponse({ request, file, fields }) {
  if (!file) throw new AppError(400, 'A video file is required', 'VIDEO_REQUIRED');

  // Idempotent retry: the same submissionId always resolves to the one record, never a second.
  const existing = await Response.findOne({ requestId: request._id, submissionId: fields.submissionId });
  if (existing) {
    if (fields.batchId) {
      const secured = await Response.findById(existing._id).select('+batchTokenHash');
      if (secured.batchTokenHash !== fields.batchTokenHash || existing.batchId !== fields.batchId || existing.questionId !== fields.questionId) throw NOT_FOUND();
    }
    await videoStore.removeTemp(file.path);
    return { duplicate: true, response: existing };
  }

  if (file.size < config.upload.minBytes) {
    throw new AppError(400, 'The recording is empty. Please record again.', 'VIDEO_EMPTY');
  }
  if (file.size > config.upload.maxBytes) {
    throw new AppError(413, 'The video is larger than 2 GiB', 'VIDEO_TOO_LARGE');
  }

  // Trust the file's own bytes, not the filename or the Content-Type the client claimed.
  const detected = await sniffVideoFile(file.path);
  if (!detected) {
    throw new AppError(415, 'Unsupported video format. Please record again using WebM or MP4.', 'UNSUPPORTED_VIDEO');
  }

  // The upload may have taken a while: the request could have been closed or expired in the meantime.
  if (!(await isRequestAccepting(request._id))) throw LINK_UNAVAILABLE();

  const videoKey = videoStore.buildKey(String(request._id), detected.extension);
  await videoStore.commit(file.path, videoKey);

  const now = new Date();
  try {
    const response = await Response.create({
      requestId: request._id,
      ...(fields.batchId ? { batchId: fields.batchId, batchTokenHash: fields.batchTokenHash, questionId: fields.questionId, questionText: fields.questionText } : {}),
      submissionId: fields.submissionId,
      clientName: fields.clientName,
      clientEmail: fields.clientEmail,
      videoKey,
      storageProvider: 'local', // development-only recording (STORAGE_PROVIDER=local)
      mimeType: detected.mimeType,
      fileSize: file.size,
      durationSeconds: fields.durationSeconds,
      consentAccepted: true,
      status: 'submitted',
      submittedAt: now,
      deleteAt: new Date(now.getTime() + config.upload.retentionDays * DAY_MS),
    });
    return { duplicate: false, response };
  } catch (err) {
    await videoStore.removeKey(videoKey); // never leave an orphaned file behind
    if (isDuplicateKeyError(err)) {
      // Two identical retries raced: the other one won, so report that record.
      const winner = await Response.findOne({ requestId: request._id, submissionId: fields.submissionId });
      if (winner) return { duplicate: true, response: winner };
    }
    throw err;
  }
}

// ---------- Employee access (ownership enforced through the parent request) ----------

// A request that exists but belongs to someone else is reported as 404, like everywhere else.
async function findOwnedRequest(user, requestId) {
  assertValidId(requestId, 'request id');
  const request = await Request.findOne({ _id: requestId, ...ownerFilter(user) }).select('_id title');
  if (!request) throw new AppError(404, 'Request not found', 'NOT_FOUND');
  return request;
}

// Employees see completed responses (submitted, or expired history). Pending and failed uploads are internal
// bookkeeping for the upload handshake and are never listed.
const VISIBLE_STATUSES = ['submitted', 'expired'];

// Paginate completed questionnaires, not their individual videos. Legacy answers are single-video submissions.
async function listResponses(user, requestId, { page, limit }) {
  const request = await findOwnedRequest(user, requestId);
  const offset = (page - 1) * limit;
  const [result] = await Submission.aggregate([
    { $match: { requestId: request._id } },
    { $project: { batchId: 1, responseIds: 1, submittedAt: '$createdAt' } },
    { $unionWith: {
      coll: Response.collection.name,
      pipeline: [
        { $match: { requestId: request._id, status: { $in: VISIBLE_STATUSES }, batchId: { $exists: false } } },
        { $project: { batchId: { $literal: null }, responseIds: ['$_id'], submittedAt: { $ifNull: ['$submittedAt', '$createdAt'] } } },
      ],
    } },
    { $facet: {
      metadata: [{ $count: 'total' }],
      items: [{ $sort: { submittedAt: 1, _id: 1 } }, { $skip: offset }, { $limit: limit }],
    } },
  ]);
  const total = result.metadata[0]?.total || 0;
  const selected = result.items;
  const docs = await Response.find({
    _id: { $in: selected.flatMap(group => group.responseIds) },
    requestId: request._id,
    status: { $in: VISIBLE_STATUSES },
  });
  const now = new Date();
  const byId = new Map(docs.map(doc => [String(doc._id), serializeResponse(doc, now)]));
  const submissions = selected.map((group, index) => {
    // Submission.responseIds captures the original question order, even if the request is edited later.
    const responses = group.responseIds.map(id => byId.get(String(id))).filter(Boolean);
    const first = responses[0];
    return {
      id: String(group._id),
      batchId: group.batchId || null,
      number: offset + index + 1,
      clientName: first?.clientName || '',
      clientEmail: first?.clientEmail || '',
      submittedAt: group.submittedAt,
      videoCount: group.responseIds.length,
      downloadable: Boolean(group.batchId) && responses.length === group.responseIds.length && responses.every(response => response.playable),
      responses,
    };
  });
  return {
    submissions,
    // Retain the flat array for existing API consumers; it contains every video in the selected complete groups.
    responses: submissions.flatMap(group => group.responses),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

// Development-only playback: resolves a stored local video to { key, mimeType } for streaming.
async function getLocalVideo(user, requestId, responseId) {
  const request = await findOwnedRequest(user, requestId);
  assertValidId(responseId, 'response id');
  const doc = await Response.findOne({ _id: responseId, requestId: request._id }).select('+videoKey');
  if (doc?.batchId && !(await Submission.exists({requestId: doc.requestId, batchId: doc.batchId, responseIds: doc._id}))) throw NOT_FOUND();
  if (doc && effectiveStatus(doc) === 'expired') throw new AppError(410, 'This video has expired', 'VIDEO_EXPIRED');
  if (!doc || doc.status !== 'submitted' || providerOf(doc) !== 'local' || !doc.videoKey) throw NOT_FOUND();
  // resolveKey re-validates the stored key, so a tampered database value can never escape the upload directory.
  if (!videoStore.resolveKey(doc.videoKey)) throw NOT_FOUND();
  return { key: doc.videoKey, mimeType: doc.mimeType };
}

// ---------- Phase 5: secure playback and download ----------

// Finds a response by id and proves the signed-in user may see it: they own the request it belongs to, or are an
// admin. Anything else is the same 404 as a missing response, so ids cannot be probed.
async function findAuthorizedResponse(user, responseId) {
  assertValidId(responseId, 'response id');
  const doc = await Response.findById(responseId).select('+videoKey');
  if (!doc) throw NOT_FOUND();
  if (doc.batchId && !(await Submission.exists({requestId: doc.requestId, batchId: doc.batchId, responseIds: doc._id}))) throw NOT_FOUND();
  const request = await Request.findOne({ _id: doc.requestId, ...ownerFilter(user) }).select('_id');
  if (!request) throw NOT_FOUND();
  return doc;
}

// Safe generated download name: never taken from the file or the client's browser, only letters, digits, - and _.
function downloadFilename(doc) {
  const slug = String(doc.clientName || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'client';
  const date = new Date(doc.submittedAt || doc.createdAt).toISOString().slice(0, 10);
  const question = String(doc.questionText || '').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
  return `${question || `response-${slug}-${date}`}-${String(doc._id).slice(-6)}.${extensionOfKey(doc.videoKey)}`;
}

// Everything that must be true before a signed URL is created. `purpose` is 'play' or 'download'.
async function authorizeVideoAccess(user, responseId, { s3, now = new Date() } = {}) {
  const doc = await findAuthorizedResponse(user, responseId);

  if (doc.status !== 'submitted' && doc.status !== 'expired') throw NOT_FOUND(); // pending / failed: not a video yet
  const deadline = retentionDeadline(doc);
  if (doc.status === 'expired' || (deadline && deadline <= now)) {
    throw new AppError(410, 'This video has passed its 180-day retention period and has been removed.', 'VIDEO_EXPIRED');
  }

  const provider = providerOf(doc);
  if (provider === 's3') {
    if (!isFinalKey(doc.videoKey)) throw new AppError(410, 'The video file is not available.', 'VIDEO_MISSING');
    // Signing does not check that the object exists, so ask S3 first: a deleted or missing file gets a clear answer.
    const info = await s3.head(doc.videoKey);
    if (!info) throw new AppError(410, 'The video file is no longer available.', 'VIDEO_MISSING');
    return { doc, provider };
  }
  if (provider === 'local') return { doc, provider };
  throw new AppError(410, 'The video file is not available.', 'VIDEO_MISSING');
}

// Short-lived signed URL for playback in the browser's video player.
async function getPlayback(user, responseId, { s3 }) {
  const { doc, provider } = await authorizeVideoAccess(user, responseId, { s3 });
  if (provider === 'local') return localAccess(doc, { download: false });
  const url = await s3.signPlaybackUrl(doc.videoKey, doc.mimeType);
  return { kind: 'signed', url, expiresInSeconds: config.s3.playbackExpiresSeconds, mimeType: doc.mimeType };
}

// Short-lived signed URL that makes the browser save the file under a safe generated name.
async function getDownload(user, responseId, { s3 }) {
  const { doc, provider } = await authorizeVideoAccess(user, responseId, { s3 });
  if (provider === 'local') return localAccess(doc, { download: true });
  const filename = downloadFilename(doc);
  const url = await s3.signDownloadUrl(doc.videoKey, doc.mimeType, filename);
  return { kind: 'signed', url, filename, expiresInSeconds: config.s3.downloadExpiresSeconds, mimeType: doc.mimeType };
}

// Phase 4 development recordings are served only by the development-only endpoint, and only while the server runs in
// local storage mode. In S3 mode they are reported as unavailable (use the migration script to move them).
function localAccess(doc, { download }) {
  if (config.storage.provider !== 'local') {
    throw new AppError(
      409,
      'This is a local development test recording. It is not available in S3 mode. See docs/aws-s3-setup.md to migrate it.',
      'LOCAL_VIDEO_UNAVAILABLE'
    );
  }
  const path = `/requests/${doc.requestId}/responses/${doc._id}/video${download ? '?download=1' : ''}`;
  return { kind: 'api', path, expiresInSeconds: null, mimeType: doc.mimeType, filename: download ? downloadFilename(doc) : undefined };
}

module.exports = {
  submitResponse,
  listResponses,
  getLocalVideo,
  getPlayback,
  getDownload,
  serializeResponse,
  effectiveStatus,
  retentionDeadline,
  downloadFilename,
};
