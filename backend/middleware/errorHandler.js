const config = require('../config/env');

// Handles requests that did not match any route.
const notFound = (req, res, next) => {
  const error = new Error(`Not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

// Maps known error types to a safe { status, message }. Anything unrecognized is a 500.
function normalizeError(err) {
  // Our own errors carry messages that are safe to show.
  if (err.name === 'AppError') {
    return { status: err.statusCode, message: err.message, code: err.code, details: err.details };
  }
  // body-parser (express.json) failures
  if (err.type === 'entity.parse.failed') {
    return { status: 400, message: 'Invalid JSON body', code: 'INVALID_JSON' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, message: 'Request body too large', code: 'BODY_TOO_LARGE' };
  }
  // Mongoose validation / bad ids
  if (err.name === 'ValidationError') {
    return { status: 400, message: 'Invalid data', code: 'VALIDATION_ERROR' };
  }
  if (err.name === 'CastError') {
    return { status: 400, message: 'Invalid identifier', code: 'INVALID_ID' };
  }
  // Database unreachable
  if (/^Mongo(Network|ServerSelection|NotConnected)/.test(err.name || '')) {
    return { status: 503, message: 'Service temporarily unavailable', code: 'DB_UNAVAILABLE' };
  }
  // Errors raised via http-errors style objects (e.g. the 404 below)
  const status = err.statusCode || err.status;
  if (status >= 400 && status < 500 && err.expose !== false) {
    return { status, message: err.message };
  }
  return { status: 500, message: 'Internal server error' };
}

// Centralized error handler. Must be registered after all routes.
// Responses never include stack traces, internal messages, or connection details.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const { status, message, code, details } = normalizeError(err);

  if (status >= 500) {
    // Log the error name/message only when it is a known-safe class; the stack stays server-side.
    console.error(`${req.method} ${req.originalUrl} -> ${status}:`, err.name, err.message);
    if (config.nodeEnv === 'development' && err.stack) console.error(err.stack);
  }

  const body = { success: false, message };
  if (code) body.code = code;
  if (details) body.details = details;
  res.status(status).json(body);
};

module.exports = { notFound, errorHandler };
