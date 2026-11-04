// Error with an HTTP status code whose message is safe to show to API clients.
// `details` (optional) is a { field: message } map for form validation errors.
class AppError extends Error {
  constructor(statusCode, message, code, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details) this.details = details;
  }
}

module.exports = AppError;
