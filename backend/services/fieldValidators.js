const AppError = require('../utils/AppError');

const TITLE_MAX = 150;
const QUESTION_MAX = 2000;
const MAX_EXPIRY_YEARS = 5;
const STATUSES = ['active', 'closed'];

// Control characters (except tab/newline, handled separately), DEL, zero-width characters, BOM and bidi
// override/isolate characters. The last group can be used to visually spoof text.
const INVISIBLE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

// Plain text only: React escapes it on render, so HTML is neither stripped nor interpreted.
function cleanText(value, { singleLine }) {
  let text = value.normalize('NFC').replace(/\r\n?/g, '\n').replace(INVISIBLE_CHARS, '');
  text = singleLine ? text.replace(/\s+/g, ' ') : text.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
  return text.trim();
}

function validateTitle(value) {
  if (typeof value !== 'string') return { error: 'Title is required' };
  const title = cleanText(value, { singleLine: true });
  if (!title) return { error: 'Title is required' };
  if (title.length > TITLE_MAX) return { error: `Title must be at most ${TITLE_MAX} characters` };
  return { value: title };
}

function validateQuestion(value) {
  if (typeof value !== 'string') return { error: 'Question is required' };
  const question = cleanText(value, { singleLine: false });
  if (!question) return { error: 'Question is required' };
  if (question.length > QUESTION_MAX) return { error: `Question must be at most ${QUESTION_MAX} characters` };
  return { value: question };
}

function validateStatus(value) {
  if (typeof value !== 'string' || !STATUSES.includes(value)) {
    return { error: 'Status must be "active" or "closed"' };
  }
  return { value };
}

// Returns { value: Date | null }. null/empty string means "no expiry".
function validateExpiresAt(value, now = new Date()) {
  if (value === null || value === '') return { value: null };
  if (typeof value !== 'string' || !ISO_DATE.test(value.trim())) {
    return { error: 'Expiration must be a valid date' };
  }
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) return { error: 'Expiration must be a valid date' };
  if (date <= now) return { error: 'Expiration must be in the future' };
  const limit = new Date(now);
  limit.setFullYear(limit.getFullYear() + MAX_EXPIRY_YEARS);
  if (date > limit) return { error: `Expiration cannot be more than ${MAX_EXPIRY_YEARS} years away` };
  return { value: date };
}

function assertPlainObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'Request body must be a JSON object', 'VALIDATION_ERROR');
  }
}

// Whitelist: anything not listed (createdBy, tokenHash, maxDurationSeconds, _id, ...) is rejected, not ignored,
// so clients cannot believe they changed something they did not.
function assertOnlyAllowedFields(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new AppError(400, 'Request contains fields that cannot be set', 'VALIDATION_ERROR', {
      fields: `Not allowed: ${unknown.slice(0, 10).join(', ')}`,
    });
  }
}

function throwIfErrors(errors) {
  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'Please correct the highlighted fields', 'VALIDATION_ERROR', errors);
  }
}

module.exports = {
  cleanText,
  validateTitle,
  validateQuestion,
  validateStatus,
  validateExpiresAt,
  assertPlainObject,
  assertOnlyAllowedFields,
  throwIfErrors,
  TITLE_MAX,
  QUESTION_MAX,
  MAX_EXPIRY_YEARS,
};
