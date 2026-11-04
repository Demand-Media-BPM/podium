const config = require('../config/env');
const AppError = require('../utils/AppError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originFromReferer(referer) {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

// CSRF defense for cookie-authenticated APIs, layered with SameSite=Lax cookies:
// every state-changing request (POST/PUT/PATCH/DELETE) must come from a trusted origin.
// Browsers always send Origin on these requests; Referer is used only as a fallback.
// Requests with neither header (curl, scripts) are rejected.
//
// If the frontend is ever hosted on a different *site* than the API, SameSite=Lax cookies
// will not be sent: switch to SameSite=None; Secure and add a CSRF token (see README).
function requireTrustedOrigin(trustedOrigins = config.trustedOrigins) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    const origin = req.get('origin') || originFromReferer(req.get('referer'));
    if (origin && trustedOrigins.includes(origin)) {
      return next();
    }

    return next(new AppError(403, 'Request origin not allowed', 'CSRF_ORIGIN'));
  };
}

module.exports = { requireTrustedOrigin };
