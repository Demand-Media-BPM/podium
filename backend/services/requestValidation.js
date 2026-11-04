const AppError = require('../utils/AppError');
const {
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
} = require('./fieldValidators');

const { validateQuestionnaire } = require('./questionnaire');
const CREATE_FIELDS = ['title', 'question', 'questions', 'clientName', 'microsite', 'expiresAt'];
const UPDATE_FIELDS = [...CREATE_FIELDS, 'status'];

function validateCreateInput(body, now = new Date()) {
  assertPlainObject(body);
  assertOnlyAllowedFields(body, CREATE_FIELDS);

  const errors = {};
  const data = {};

  const title = validateTitle(body.title);
  if (title.error) errors.title = title.error;
  else data.title = title.value;

  if (body.questions !== undefined || body.clientName !== undefined || body.microsite !== undefined) {
    Object.assign(data, validateQuestionnaire(body));
  } else {
    const question = validateQuestion(body.question);
    if (question.error) errors.question = question.error;
    else data.question = question.value;
  }

  if (body.expiresAt !== undefined) {
    const expiresAt = validateExpiresAt(body.expiresAt, now);
    if (expiresAt.error) errors.expiresAt = expiresAt.error;
    else if (expiresAt.value) data.expiresAt = expiresAt.value;
  }

  throwIfErrors(errors);
  return data;
}

// Returns { set, unset } built only from validated, whitelisted fields.
function validateUpdateInput(body, now = new Date()) {
  assertPlainObject(body);
  assertOnlyAllowedFields(body, UPDATE_FIELDS);

  const errors = {};
  const set = {};
  const unset = {};
  if (body.questions !== undefined || body.clientName !== undefined || body.microsite !== undefined) {
    Object.assign(set, validateQuestionnaire(body, { partial: true }));
  }

  if (body.title !== undefined) {
    const title = validateTitle(body.title);
    if (title.error) errors.title = title.error;
    else set.title = title.value;
  }
  if (body.question !== undefined) {
    const question = validateQuestion(body.question);
    if (question.error) errors.question = question.error;
    else set.question = question.value;
  }
  if (body.status !== undefined) {
    const status = validateStatus(body.status);
    if (status.error) errors.status = status.error;
    else set.status = status.value;
  }
  if (body.expiresAt !== undefined) {
    const expiresAt = validateExpiresAt(body.expiresAt, now);
    if (expiresAt.error) errors.expiresAt = expiresAt.error;
    else if (expiresAt.value) set.expiresAt = expiresAt.value;
    else unset.expiresAt = 1;
  }

  throwIfErrors(errors);

  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
    throw new AppError(400, 'No changes were supplied', 'VALIDATION_ERROR');
  }
  return { set, unset };
}

// Pagination from the query string. Invalid values are rejected rather than silently changed.
function parsePagination(query, { defaultLimit = 10, maxLimit = 50 } = {}) {
  const parse = (raw, fallback, min, max, name) => {
    if (raw === undefined) return fallback;
    if (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw)) {
      throw new AppError(400, `Invalid ${name}`, 'VALIDATION_ERROR', { [name]: `${name} must be a whole number` });
    }
    const number = Number(raw);
    if (number < min || number > max) {
      throw new AppError(400, `Invalid ${name}`, 'VALIDATION_ERROR', { [name]: `${name} must be between ${min} and ${max}` });
    }
    return number;
  };
  return {
    page: parse(query.page, 1, 1, 100000, 'page'),
    limit: parse(query.limit, defaultLimit, 1, maxLimit, 'limit'),
  };
}

module.exports = {
  validateCreateInput,
  validateUpdateInput,
  validateExpiresAt,
  parsePagination,
  TITLE_MAX,
  QUESTION_MAX,
  MAX_EXPIRY_YEARS,
};
