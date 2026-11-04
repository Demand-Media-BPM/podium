const { assertDbReady } = require('../config/db');
const AppError = require('../utils/AppError');
const config = require('../config/env');
const { getPublicRequest, findAcceptingRequest, findRequestByToken } = require('../services/requestService');
const { submitResponse } = require('../services/responseService');
const { validateSubmissionFields, validateInitiateFields } = require('../services/responseValidation');
const { initiateUpload, completeUpload } = require('../services/uploadService');

// Which submission flow is active is decided by configuration, never by the client:
//   s3    -> POST /uploads and /uploads/:id/complete (direct browser-to-S3). The Phase 4 endpoint is switched off.
//   local -> the Phase 4 endpoint (development only; refused in production by config validation).
const requireProvider = (provider) => (req, res, next) => {
  if (config.storage.provider !== provider) {
    return next(new AppError(404, 'Not found', 'NOT_FOUND'));
  }
  return next();
};

// GET /api/public/:token - no authentication. Returns only title, question and max duration.
const getQuestion = async (req, res) => {
  assertDbReady();
  const request = await getPublicRequest(req.params.token);
  res.status(200).json({ success: true, request });
};

// Runs BEFORE the upload is read, so a bad, closed or expired link never makes the server accept a large body.
// Bad, unknown, closed and expired links all get the same generic response.
const resolveAcceptingRequest = async (req, res, next) => {
  assertDbReady();
  const request = await findAcceptingRequest(req.params.token);
  if (!request) throw new AppError(404, 'This link is not available', 'LINK_UNAVAILABLE');
  req.targetRequest = request;
  next();
};

// POST /api/public/:token/responses - multipart/form-data, no authentication.
// The body was already parsed by the upload middleware (text fields in req.body, the file in req.file).
const createResponse = async (req, res) => {
  let result;
  try {
    let fields = validateSubmissionFields(req.body, { maxDurationSeconds: req.targetRequest.maxDurationSeconds });
    fields = require('../services/questionnaire').validateAnswerContext(req.targetRequest, fields);
    assertDbReady();
    result = await submitResponse({ request: req.targetRequest, file: req.file, fields });
  } finally {
    // Success or failure, the temp upload is gone before the client gets an answer (a successful submit has
    // already moved the file into place, so this removes nothing then).
    await req.cleanupUploads().catch(() => {});
  }
  // Only a confirmed, stored submission gets this success response. Nothing about the stored file is returned.
  res.status(result.duplicate ? 200 : 201).json({
    success: true,
    duplicate: result.duplicate,
    ...(result.response?.batchId ? {responseId: result.response.id} : {}),
    message: 'Your response has been submitted',
  });
};

// POST /api/public/:token/uploads - starts a submission and returns a presigned POST for exactly one S3 object.
const initiate = async (req, res) => {
  let fields = validateInitiateFields(req.body, {
    maxDurationSeconds: req.targetRequest.maxDurationSeconds,
    minBytes: config.upload.minBytes,
    maxBytes: config.upload.maxBytes,
  });
  assertDbReady();
  fields = require('../services/questionnaire').validateAnswerContext(req.targetRequest, fields);
  const result = await initiateUpload({ request: req.targetRequest, fields });
  if (result.alreadySubmitted) {
    // The same submission id was already completed: a retry after a lost confirmation. Nothing to upload.
    return res.status(200).json({ success: true, alreadySubmitted: true, ...(req.targetRequest.questions?.length ? {responseId: result.responseId} : {}) });
  }
  return res.status(201).json({ success: true, alreadySubmitted: false, ...result });
};

// POST /api/public/:token/uploads/:responseId/complete - verifies the object in S3, then marks it submitted.
// Body: { completionToken }. The public link token, the response id AND the completion token must all match.
const complete = async (req, res) => {
  assertDbReady();
  const request = await findRequestByToken(req.params.token);
  if (!request) throw new AppError(404, 'This link is not available', 'LINK_UNAVAILABLE');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const result = await completeUpload({
    request,
    responseId: req.params.responseId,
    credential: body.completionToken,
  });
  // Only a response that is verified and saved gets this success answer.
  res.status(200).json({ success: true, duplicate: result.duplicate, message: 'Your response has been submitted' });
};

module.exports = { getQuestion, resolveAcceptingRequest, createResponse, initiate, complete, requireProvider };
