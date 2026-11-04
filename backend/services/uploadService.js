const crypto = require('crypto');
const mongoose = require('mongoose');
const { Response } = require('../models');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const { assertValidId } = require('../utils/ids');
const { getS3Service } = require('./s3Service');
const { newUploadKey } = require('./objectKeys');
const { sniffVideoBuffer } = require('./videoSniffer');
const { isRequestAccepting } = require('./requestService');

// Direct browser-to-S3 submissions.
//
//   initiateUpload  creates (or re-issues) a pending response and returns a presigned POST for ONE object key plus a
//                   random completion credential. Only the credential's SHA-256 hash is stored.
//   completeUpload  verifies the uploaded object, promotes it to the retention prefix, and only then marks the
//                   response submitted. Nothing is "submitted" because the browser says so.
//
// Authorization for completion = the public link token + the response id + the completion credential. A response id
// alone is never enough, and a client cannot touch another client's pending submission.

const DAY_MS = 24 * 60 * 60 * 1000;
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const newCredential = () => crypto.randomBytes(32).toString('base64url');

function credentialMatches(token, storedHash) {
  if (typeof token !== 'string' || !CREDENTIAL_PATTERN.test(token) || typeof storedHash !== 'string') return false;
  const a = Buffer.from(sha256(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const notFound = () => new AppError(404, 'Upload not found', 'NOT_FOUND');
const linkUnavailable = () => new AppError(404, 'This link is not available', 'LINK_UNAVAILABLE');
const closed = () => new AppError(409, 'This submission can no longer be completed. Please record again.', 'SUBMISSION_CLOSED');
const isDuplicateKeyError = (err) => Boolean(err && err.code === 11000);

async function authorize(s3, { responseId, credential, uploadKey, mimeType, fileSize }) {
  const upload = await s3.createUploadAuthorization({ key: uploadKey, mimeType, size: fileSize, responseId: String(responseId) });
  return {
    alreadySubmitted: false,
    responseId: String(responseId),
    completionToken: credential, // shown to this client once; never stored in readable form
    upload: { method: 'POST', url: upload.url, fields: upload.fields, expiresAt: upload.expiresAt },
  };
}

// A retry for an existing submission id. Pending: rotate the key and credential (older authorizations stop
// being accepted at completion). Submitted: nothing to do. Failed/expired: the client must start over.
async function reissue(s3, existingDoc, fields) {
  if (fields.batchId && (existingDoc.batchId !== fields.batchId || existingDoc.questionId !== fields.questionId)) throw notFound();
  if (fields.batchId) {
    const secured = await Response.findById(existingDoc._id).select('+batchTokenHash');
    if (secured.batchTokenHash !== fields.batchTokenHash) throw notFound();
  }
  // uploadKey is hidden by default; the previous key is needed to clean up the replaced authorization.
  const existing = (await Response.findById(existingDoc._id).select('+uploadKey')) || existingDoc;
  if (existing.status === 'submitted') return { alreadySubmitted: true, responseId: String(existing._id) };
  if (existing.status !== 'pending_upload') throw closed();

  const credential = newCredential();
  const uploadKey = newUploadKey(String(existing.requestId), fields.mimeType);
  const updated = await Response.findOneAndUpdate(
    { _id: existing._id, status: 'pending_upload' },
    {
      $set: {
        clientName: fields.clientName,
        clientEmail: fields.clientEmail,
        durationSeconds: fields.durationSeconds,
        mimeType: fields.mimeType,
        fileSize: fields.fileSize,
        uploadKey,
        uploadTokenHash: sha256(credential),
        uploadIssuedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
  if (!updated) {
    // Completed (or closed) by another request in the meantime.
    const current = await Response.findById(existing._id);
    if (current && current.status === 'submitted') return { alreadySubmitted: true, responseId: String(current._id) };
    throw closed();
  }
  // The previous authorization is replaced: remove anything the earlier attempt may already have uploaded.
  if (existing.uploadKey) await s3.deleteObject(existing.uploadKey).catch(() => {});
  return authorize(s3, { responseId: existing._id, credential, uploadKey, mimeType: fields.mimeType, fileSize: fields.fileSize });
}

// `request` is the active, non-expired request found for the public token. `fields` were validated by
// validateInitiateFields (size 1 KiB..100 MiB, WebM/MP4 only, consent true, UUID submission id).
async function initiateUpload({ request, fields, s3 = getS3Service() }) {
  const findExisting = () => Response.findOne({ requestId: request._id, submissionId: fields.submissionId });

  const existing = await findExisting();
  if (existing) return reissue(s3, existing, fields);

  const responseId = new mongoose.Types.ObjectId();
  const credential = newCredential();
  const uploadKey = newUploadKey(String(request._id), fields.mimeType);
  try {
    await Response.create({
      _id: responseId,
      requestId: request._id,
      ...(fields.batchId ? { batchId: fields.batchId, batchTokenHash: fields.batchTokenHash, questionId: fields.questionId, questionText: fields.questionText } : {}),
      submissionId: fields.submissionId,
      clientName: fields.clientName,
      clientEmail: fields.clientEmail,
      consentAccepted: true,
      durationSeconds: fields.durationSeconds,
      mimeType: fields.mimeType,
      fileSize: fields.fileSize,
      status: 'pending_upload',
      storageProvider: 's3',
      uploadKey,
      uploadTokenHash: sha256(credential),
      uploadIssuedAt: new Date(),
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      // Two identical first requests raced: the other one created the record, so re-issue on top of it.
      const winner = await findExisting();
      if (winner) return reissue(s3, winner, fields);
    }
    throw err;
  }
  return authorize(s3, { responseId, credential, uploadKey, mimeType: fields.mimeType, fileSize: fields.fileSize });
}

// Marks a pending response failed (atomically, only if it is still pending), deletes its uploaded object, and
// reports the reason to the client. A failed submission can never become submitted: the client must start over.
async function failUpload(s3, response, reason, error) {
  await Response.updateOne(
    { _id: response._id, status: 'pending_upload' },
    // The credential hash is kept (it is only a hash) so a repeated completion gets a clear "closed" answer, which
    // makes the browser start a fresh submission, instead of a misleading "not found".
    { $set: { status: 'failed', failureReason: reason }, $unset: { uploadKey: 1, uploadIssuedAt: 1 } }
  );
  await s3.deleteObject(response.uploadKey).catch(() => {}); // best effort: the lifecycle rule also removes it
  throw error;
}

// Checks the uploaded object against what was authorized and returns its S3 metadata. The object itself is the
// source of truth: its real size and type, the response id stamped into it by the signed policy, and its first bytes.
async function verifyUploadedObject(s3, response) {
  const info = await s3.head(response.uploadKey);
  if (!info) {
    throw new AppError(409, 'We could not find your uploaded video. Please try submitting again.', 'UPLOAD_MISSING');
  }
  if (info.size !== response.fileSize || info.size > config.upload.maxBytes || info.size < config.upload.minBytes) {
    return failUpload(s3, response, 'size_mismatch', new AppError(422, 'The uploaded video did not match what was expected. Please record again.', 'UPLOAD_INVALID'));
  }
  if (String(info.contentType || '').toLowerCase() !== response.mimeType || info.metadata['response-id'] !== String(response._id)) {
    return failUpload(s3, response, 'metadata_mismatch', new AppError(422, 'The uploaded video did not match what was expected. Please record again.', 'UPLOAD_INVALID'));
  }
  const start = await s3.readStart(response.uploadKey);
  const detected = start ? sniffVideoBuffer(start) : null;
  if (!detected || detected.mimeType !== response.mimeType) {
    return failUpload(s3, response, 'unsupported_video', new AppError(415, 'Unsupported video format. Please record again, or try a different browser.', 'UNSUPPORTED_VIDEO'));
  }
  return info;
}

// Completes a pending submission. `request` is the request that owns the public link (any status): it is re-checked
// here so a request closed or expired during the upload does not receive a response - except that a repeat call for an
// already-submitted response is simply confirmed, so a client whose first confirmation was lost still sees success.
async function completeUpload({ request, responseId, credential, s3 = getS3Service() }) {
  assertValidId(responseId, 'upload id');
  const response = await Response.findOne({ _id: responseId, requestId: request._id }).select('+uploadKey +uploadTokenHash');

  // Same answer for "no such response", "not yours" and "wrong credential": nothing about other clients leaks.
  // The credential hash is kept on submitted responses, so even a repeat (idempotent) completion must prove it.
  if (!response || !credentialMatches(credential, response.uploadTokenHash || '')) throw notFound();

  if (response.status === 'submitted') return { duplicate: true };
  if (response.status !== 'pending_upload') throw closed();
  if (Date.now() - new Date(response.uploadIssuedAt).getTime() > config.s3.pendingMaxAgeMs) throw closed();
  if (!(await isRequestAccepting(request._id))) throw linkUnavailable();

  const info = await verifyUploadedObject(s3, response);

  // Promote to responses/ only if the object is still exactly the version that was just verified.
  const promoted = await s3.promote(response.uploadKey, info.etag);
  if (promoted.changed) {
    return failUpload(s3, response, 'changed_after_verify', new AppError(409, 'The upload changed while it was being checked. Please record again.', 'UPLOAD_INVALID'));
  }

  // The retention deadline is anchored to the S3 object's own creation time: that is the clock the lifecycle rule
  // uses, so the app deadline can never be later than S3's physical deletion.
  const now = new Date();
  const deleteAt = new Date(promoted.lastModified.getTime() + config.upload.retentionDays * DAY_MS);

  const updated = await Response.findOneAndUpdate(
    { _id: response._id, status: 'pending_upload', uploadTokenHash: response.uploadTokenHash },
    {
      $set: {
        status: 'submitted',
        storageProvider: 's3',
        videoKey: promoted.key,
        fileSize: promoted.size,
        submittedAt: now,
        deleteAt,
      },
      // uploadTokenHash stays (a hash only): it lets a repeated completion call be authenticated and confirmed.
      $unset: { uploadKey: 1, uploadIssuedAt: 1, failureReason: 1 },
    },
    { returnDocument: 'after' }
  );

  if (!updated) {
    // Lost a race. If a concurrent completion already submitted it, that record owns the final object: leave it alone.
    const current = await Response.findById(response._id);
    if (current && current.status === 'submitted') return { duplicate: true };
    await s3.deleteObject(promoted.key).catch(() => {});
    throw closed();
  }

  await s3.deleteObject(response.uploadKey).catch(() => {}); // the pending copy is no longer needed
  return { duplicate: false };
}

module.exports = {
  initiateUpload,
  completeUpload,
  credentialMatches,
  sha256,
  newCredential,
  CREDENTIAL_PATTERN,
  DAY_MS,
};
