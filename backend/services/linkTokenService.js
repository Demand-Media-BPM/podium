const crypto = require('crypto');
const config = require('../config/env');

// Older requests use 32-byte tokens; new requests use client-name slugs and two digits.
const TOKEN_BYTES = 32;
const TOKEN_LENGTH = 43;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function clientSlug(name) {
  return String(name || 'client').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60) || 'client';
}
function generateToken(name) {
  return name === undefined ? crypto.randomBytes(TOKEN_BYTES).toString('base64url') : clientSlug(name) + String(crypto.randomInt(100)).padStart(2, '0');
}
function tokenCandidates(name) {
  const numbers = Array.from({ length: 100 }, (_, i) => i);
  for (let i = 99; i > 0; i--) { const j = crypto.randomInt(i + 1); [numbers[i], numbers[j]] = [numbers[j], numbers[i]]; }
  return numbers.map(n => clientSlug(name) + String(n).padStart(2, '0'));
}

// Store only a SHA-256 digest for link lookup. New short URLs are public access codes.
function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

// Cheap shape check done before hashing or touching the database.
function isValidTokenFormat(token) {
  return typeof token === 'string' && (TOKEN_PATTERN.test(token) || /^[a-z0-9]{1,60}[0-9]{2}$/.test(token));
}

function buildPublicUrl(token) {
  return `${config.publicBaseUrl}/respond/${token}`;
}

// True when a write failed because another request already has this tokenHash (practically impossible).
function isDuplicateTokenError(err) {
  return Boolean(
    err && err.code === 11000 && (err.keyPattern?.tokenHash || /tokenHash/.test(String(err.message)))
  );
}

module.exports = {
  generateToken,
  tokenCandidates,
  clientSlug,
  hashToken,
  isValidTokenFormat,
  buildPublicUrl,
  isDuplicateTokenError,
  TOKEN_BYTES,
  TOKEN_LENGTH,
};
