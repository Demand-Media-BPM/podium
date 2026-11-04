const fs = require('fs');
const { Request, Response, Submission } = require('../models');
const AppError = require('../utils/AppError');
const { digest, questionsOf, validBatch } = require('./questionnaire');
const { findRequestByToken, isRequestAccepting } = require('./requestService');
const { ownerFilter } = require('../utils/access');
const { assertValidId } = require('../utils/ids');
const { providerOf } = require('../utils/provider');
const { retentionDeadline, downloadFilename } = require('./responseService');
const videoStore = require('./videoStore');
const { getS3Service } = require('./s3Service');

async function finalizeSubmission(token, body) {
  require('../config/db').assertDbReady();
  const request = await findRequestByToken(token);
  if (!request) throw new AppError(404, 'This link is not available', 'LINK_UNAVAILABLE');
  if (!body || !validBatch(body.batchId, body.batchToken)) throw new AppError(400, 'Invalid submission', 'VALIDATION_ERROR');
  const tokenHash = digest(body.batchToken);
  const existing = await Submission.findOne({requestId: request._id, batchId: body.batchId}).select('+tokenHash');
  if (existing) {
    if (existing.tokenHash !== tokenHash) throw new AppError(404, 'Submission not found', 'NOT_FOUND');
    return {duplicate: true};
  }
  if (!(await isRequestAccepting(request._id))) throw new AppError(404, 'This link is not available', 'LINK_UNAVAILABLE');
  if (!Array.isArray(body.answers) || body.answers.length !== questionsOf(request).length) throw new AppError(400, 'Answer every question before submitting', 'ANSWERS_REQUIRED');
  const ids = body.answers;
  if (ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) || new Set(ids).size !== ids.length) throw new AppError(400, 'Invalid answers', 'VALIDATION_ERROR');
  const answers = await Response.find({_id: {$in: ids}, requestId: request._id, batchId: body.batchId, status: 'submitted'}).select('+batchTokenHash');
  const questions = questionsOf(request);
  if (answers.length !== questions.length || questions.some(q => answers.filter(a => a.questionId === q.id && a.questionText === q.text).length !== 1) || answers.some(a => a.batchTokenHash !== tokenHash || !a.consentAccepted || (retentionDeadline(a) && retentionDeadline(a) <= new Date()))) throw new AppError(400, 'Every current question needs a valid video answer. Reload if the questions changed.', 'ANSWERS_REQUIRED');
  if (answers.some(a => a.clientName !== answers[0].clientName || a.clientEmail !== answers[0].clientEmail)) throw new AppError(400, 'Client details must match across answers', 'VALIDATION_ERROR');
  if (answers.reduce((sum,a) => sum + Math.round(a.durationSeconds * 10), 0) > request.maxDurationSeconds * 10) throw new AppError(400, 'The total recording length exceeds 59 minutes', 'DURATION_EXCEEDED');
  const responseIds = questions.map(q => answers.find(a => a.questionId === q.id)._id);
  try { await Submission.create({requestId: request._id, batchId: body.batchId, tokenHash, responseIds}); }
  catch (err) {
    if (err.code !== 11000) throw err;
    const winner = await Submission.findOne({requestId: request._id, batchId: body.batchId}).select('+tokenHash');
    if (!winner || winner.tokenHash !== tokenHash) throw new AppError(404, 'Submission not found', 'NOT_FOUND');
    return {duplicate: true};
  }
  return {duplicate: false};
}

async function downloadSubmission(req, res) {
  assertValidId(req.params.id, 'request id');
  const request = await Request.findOne({_id: req.params.id, ...ownerFilter(req.user)});
  if (!request) throw new AppError(404, 'Request not found', 'NOT_FOUND');
  const group = await Submission.findOne({requestId: request._id, batchId: req.params.batchId});
  if (!group) throw new AppError(404, 'Submission not found', 'NOT_FOUND');
  const docs = await Response.find({_id: {$in: group.responseIds}, requestId: request._id}).select('+videoKey');
  if (docs.length !== group.responseIds.length) throw new AppError(410, 'An answer is missing', 'VIDEO_MISSING');
  const streams = [];
  try {
    for (const id of group.responseIds) {
      const doc = docs.find(d => String(d._id) === String(id));
      const deadline = retentionDeadline(doc);
      if (doc.status !== 'submitted' || (deadline && deadline <= new Date())) throw new AppError(410, 'A video has expired', 'VIDEO_EXPIRED');
      if (providerOf(doc) === 's3') streams.push({doc, stream: await getS3Service().openVideo(doc.videoKey)});
      else {
        if (require('../config/env').storage.provider !== 'local') throw new AppError(409, 'Local recording unavailable in S3 mode', 'LOCAL_VIDEO_UNAVAILABLE');
        const path = videoStore.resolveKey(doc.videoKey);
        if (!path || !fs.existsSync(path)) throw new AppError(410, 'Video missing', 'VIDEO_MISSING');
        streams.push({doc, stream: fs.createReadStream(path)});
      }
    }
  } catch (err) { streams.forEach(s => s.stream.destroy()); throw err; }
  const slug = String(docs[0]?.clientName || 'client').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60);
  res.set({'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="' + slug + '-responses.zip"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'});
  const {ZipArchive} = await import('archiver');
  const archive = new ZipArchive({store: true}); // Video is already compressed; stream without buffering or recompression.
  const cleanup = () => { archive.abort(); streams.forEach(s => s.stream.destroy()); };
  res.on('close', cleanup);
  archive.on('error', () => { cleanup(); res.destroy(); });
  archive.pipe(res);
  streams.forEach(({doc,stream}, index) => {
    stream.on('error', err => archive.emit('error', err));
    archive.append(stream, {name: String(index + 1).padStart(2, '0') + '-' + downloadFilename(doc)});
  });
  await archive.finalize();
}
module.exports = {finalizeSubmission, downloadSubmission};
