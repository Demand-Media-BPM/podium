const AppError = require('./AppError');

// Strictly 24 hex characters. mongoose.isValidObjectId() also accepts any 12-character string,
// which is too permissive for ids that arrive in URLs.
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

function isValidObjectIdString(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

// Call before querying so malformed ids never reach MongoDB.
function assertValidId(value, label = 'identifier') {
  if (!isValidObjectIdString(value)) {
    throw new AppError(400, `Invalid ${label}`, 'INVALID_ID');
  }
  return value;
}

module.exports = { isValidObjectIdString, assertValidId };
