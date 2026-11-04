const AppError = require('../utils/AppError');
const { cleanText, assertPlainObject, assertOnlyAllowedFields, throwIfErrors } = require('./fieldValidators');

const NAME_MAX = 100;
const EMAIL_MAX = 254;
const EMAIL_LOCAL_MAX = 64;
// Recordings stop at the maximum on the client; a little tolerance covers timer/stop latency.
const DURATION_TOLERANCE_SECONDS = 2;

const SUBMISSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Practical address check (a dot-separated domain with at least two labels, no spaces or control characters).
const EMAIL_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

// Text fields allowed in the multipart body (besides the `video` file). Anything else is rejected.
const CONTEXT_FIELDS = ['questionId', 'batchId', 'batchToken'];
const SUBMISSION_FIELDS = ['submissionId', 'clientName', 'clientEmail', 'consentAccepted', 'durationSeconds', ...CONTEXT_FIELDS];

function validateClientName(value) {
  if (typeof value !== 'string') return { error: 'Name is required' };
  const name = cleanText(value, { singleLine: true });
  if (!name) return { error: 'Name is required' };
  if (name.length > NAME_MAX) return { error: `Name must be at most ${NAME_MAX} characters` };
  return { value: name };
}

function validateClientEmail(value) {
  if (typeof value !== 'string') return { error: 'Email is required' };
  const email = value.trim().toLowerCase();
  if (!email) return { error: 'Email is required' };
  if (email.length > EMAIL_MAX) return { error: `Email must be at most ${EMAIL_MAX} characters` };
  const [local = ''] = email.split('@');
  const validLocal =
    local.length <= EMAIL_LOCAL_MAX && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..');
  if (!EMAIL_PATTERN.test(email) || !validLocal) return { error: 'Enter a valid email address' };
  return { value: email };
}

// Multipart values are always text, so consent must be exactly the string "true".
function validateConsent(value) {
  if (value !== 'true') return { error: 'You must give consent before submitting' };
  return { value: true };
}

// Informational only: the server cannot verify the length of the video without decoding it.
function validateDuration(value, maxDurationSeconds) {
  if (typeof value !== 'string' || !/^\d{1,4}(\.\d{1,3})?$/.test(value)) {
    return { error: 'Recording duration is invalid' };
  }
  const seconds = Number(value);
  if (!(seconds > 0)) return { error: 'Recording duration is invalid' };
  if (seconds > maxDurationSeconds + DURATION_TOLERANCE_SECONDS) {
    return { error: `Recording is longer than the ${maxDurationSeconds} second limit` };
  }
  return { value: Math.round(Math.min(seconds, maxDurationSeconds) * 10) / 10 };
}

function validateSubmissionId(value) {
  if (typeof value !== 'string' || !SUBMISSION_ID_PATTERN.test(value)) {
    return { error: 'Submission id is invalid' };
  }
  return { value: value.toLowerCase() };
}

// body = multer's parsed text fields. Returns only validated, whitelisted values.
function validateSubmissionFields(body, { maxDurationSeconds }) {
  assertPlainObject(body || {});
  const input = body || {};
  assertOnlyAllowedFields(input, SUBMISSION_FIELDS);

  const errors = {};
  const data = {};
  const checks = [
    ['submissionId', validateSubmissionId(input.submissionId)],
    ['clientName', validateClientName(input.clientName)],
    ['clientEmail', validateClientEmail(input.clientEmail)],
    ['consentAccepted', validateConsent(input.consentAccepted)],
    ['durationSeconds', validateDuration(input.durationSeconds, maxDurationSeconds)],
  ];
  for (const [field, result] of checks) {
    if (result.error) errors[field] = result.error;
    else data[field] = result.value;
  }

  throwIfErrors(errors);
  for (const key of CONTEXT_FIELDS) if (input[key] !== undefined) data[key] = input[key];
  return data;
}

function videoError(status, message, code) {
  return new AppError(status, message, code);
}

// ---------- Phase 5: JSON body of POST /api/public/:token/uploads ----------

const INITIATE_FIELDS = ['submissionId', 'clientName', 'clientEmail', 'consentAccepted', 'durationSeconds', 'mimeType', 'fileSize', ...CONTEXT_FIELDS];
const ALLOWED_MIME_TYPES = ['video/webm', 'video/mp4'];

// Browsers report types like "video/webm;codecs=vp9,opus". Only the container type is kept; the parameters are dropped.
function validateMimeType(value) {
  if (typeof value !== 'string') return { error: 'Video type is required' };
  const base = value.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(base)) return { error: 'Only WebM and MP4 recordings are supported' };
  return { value: base };
}

// The exact byte length of the recording. It is pinned in the presigned upload policy, so S3 refuses any other size.
function validateFileSize(value, { minBytes, maxBytes }) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return { error: 'Video size is invalid' };
  if (value > maxBytes) return { error: 'The video is larger than 2 GiB', tooLarge: true };
  if (value < minBytes) return { error: 'The recording is empty. Please record again.' };
  return { value };
}

function validateConsentFlag(value) {
  return value === true ? { value: true } : { error: 'You must give consent before submitting' };
}

// body = the parsed JSON body. Returns only validated, whitelisted values; throws AppError otherwise.
function validateInitiateFields(body, { maxDurationSeconds, minBytes, maxBytes }) {
  assertPlainObject(body);
  assertOnlyAllowedFields(body, INITIATE_FIELDS);

  const duration = typeof body.durationSeconds === 'number' && Number.isFinite(body.durationSeconds) ? String(body.durationSeconds) : body.durationSeconds;
  const size = validateFileSize(body.fileSize, { minBytes, maxBytes });
  const checks = [
    ['submissionId', validateSubmissionId(body.submissionId)],
    ['clientName', validateClientName(body.clientName)],
    ['clientEmail', validateClientEmail(body.clientEmail)],
    ['consentAccepted', validateConsentFlag(body.consentAccepted)],
    ['durationSeconds', validateDuration(duration, maxDurationSeconds)],
    ['mimeType', validateMimeType(body.mimeType)],
    ['fileSize', size],
  ];

  const errors = {};
  const data = {};
  for (const [field, result] of checks) {
    if (result.error) errors[field] = result.error;
    else data[field] = result.value;
  }
  // An oversized video gets its own status so the browser can say so clearly.
  if (size.tooLarge && Object.keys(errors).length === 1) throw new AppError(413, size.error, 'VIDEO_TOO_LARGE');
  throwIfErrors(errors);
  for (const key of CONTEXT_FIELDS) if (body[key] !== undefined) data[key] = body[key];
  return data;
}

module.exports = {
  validateInitiateFields,
  validateMimeType,
  validateFileSize,
  ALLOWED_MIME_TYPES,
  validateSubmissionFields,
  validateClientName,
  validateClientEmail,
  validateConsent,
  validateDuration,
  validateSubmissionId,
  videoError,
  NAME_MAX,
  EMAIL_MAX,
  DURATION_TOLERANCE_SECONDS,
  SUBMISSION_FIELDS,
};
