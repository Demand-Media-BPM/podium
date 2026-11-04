const config = require('../config/env');

// One place defines the cookie attributes so setting and clearing always match.
//  - HttpOnly: JavaScript cannot read the token (protects against XSS token theft)
//  - Secure: HTTPS only in production
//  - SameSite=Lax: not sent on cross-site POST/fetch requests (first layer of CSRF defense)
function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

function setSessionCookie(res, token) {
  res.cookie(config.session.cookieName, token, {
    ...getSessionCookieOptions(),
    maxAge: config.session.maxAgeMs,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(config.session.cookieName, getSessionCookieOptions());
}

module.exports = { getSessionCookieOptions, setSessionCookie, clearSessionCookie };
