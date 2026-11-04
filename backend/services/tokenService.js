const jwt = require('jsonwebtoken');
const config = require('../config/env');

const ALGORITHM = 'HS256';

// The token carries only the user id (as "sub"). Role and active status are always read from
// MongoDB on each request, so role changes and deactivation take effect immediately.
function signSessionToken(userId) {
  return jwt.sign({}, config.jwtSecret, {
    algorithm: ALGORITHM,
    subject: String(userId),
    expiresIn: config.session.jwtExpiresIn,
    issuer: config.session.issuer,
    audience: config.session.audience,
  });
}

// Throws if the token is malformed, tampered with, expired, or issued for something else.
// The algorithm is pinned so "alg: none" and algorithm-confusion tokens are rejected.
function verifySessionToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: [ALGORITHM],
    issuer: config.session.issuer,
    audience: config.session.audience,
  });
}

module.exports = { signSessionToken, verifySessionToken };
