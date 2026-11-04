require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateToken,
  hashToken,
  isValidTokenFormat,
  buildPublicUrl,
  isDuplicateTokenError,
  TOKEN_BYTES,
  TOKEN_LENGTH,
} = require('../../services/linkTokenService');
const { buildConfig, findConfigProblems } = require('../../config/env');

test('tokens come from at least 32 random bytes (256 bits)', () => {
  assert.ok(TOKEN_BYTES >= 32);
  const token = generateToken();
  assert.equal(Buffer.from(token, 'base64url').length, TOKEN_BYTES);
});

test('tokens are URL-safe and have a fixed length', () => {
  for (let i = 0; i < 50; i += 1) {
    const token = generateToken();
    assert.equal(token.length, TOKEN_LENGTH);
    assert.match(token, /^[A-Za-z0-9_-]+$/, 'no +, / or = characters');
    assert.equal(encodeURIComponent(token), token, 'needs no URL escaping');
    assert.equal(isValidTokenFormat(token), true);
  }
});

test('10,000 generated tokens are all unique', () => {
  const seen = new Set();
  for (let i = 0; i < 10000; i += 1) seen.add(generateToken());
  assert.equal(seen.size, 10000);
});

test('hashToken is SHA-256 hex, deterministic, and never equals the token', () => {
  const token = generateToken();
  const hash = hashToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hashToken(token), hash);
  assert.notEqual(hash, token);
  assert.notEqual(hashToken(generateToken()), hash);
  // Known SHA-256 vector so the algorithm cannot silently change.
  assert.equal(hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('isValidTokenFormat rejects wrong types, lengths and characters', () => {
  const good = generateToken();
  const bad = [
    undefined, null, 42, {}, [], '', 'short', good + 'a', good.slice(1),
    `${good.slice(0, 42)}+`, `${good.slice(0, 42)}/`, `${good.slice(0, 42)}=`, `${good.slice(0, 42)} `,
    `${good.slice(0, 41)}%2F`, `${good.slice(0, 42)}\n`, '.'.repeat(43), '../'.repeat(15),
  ];
  for (const value of bad) assert.equal(isValidTokenFormat(value), false, JSON.stringify(value));
});

test('buildPublicUrl uses the configured base URL and /respond/<token>', () => {
  const url = buildPublicUrl('TOKEN');
  assert.equal(url, 'http://localhost:5173/respond/TOKEN');
});

test('PUBLIC_BASE_URL overrides FRONTEND_URL and is normalized (no trailing slash/path)', () => {
  const env = { FRONTEND_URL: 'http://localhost:5173', PUBLIC_BASE_URL: 'https://tool.example.com/some/path/' };
  assert.equal(buildConfig(env).publicBaseUrl, 'https://tool.example.com');
  assert.equal(buildConfig({ FRONTEND_URL: 'https://a.example.com/' }).publicBaseUrl, 'https://a.example.com');
});

test('PUBLIC_BASE_URL is validated', () => {
  const base = {
    MONGODB_URI: 'mongodb://h/',
    JWT_SECRET: 'x'.repeat(40),
    FRONTEND_URL: 'http://localhost:5173',
    STORAGE_PROVIDER: 'local', // storage is validated separately (see config.test.js)
  };
  assert.ok(findConfigProblems(buildConfig({ ...base, PUBLIC_BASE_URL: 'not a url' })).some((p) => p.startsWith('PUBLIC_BASE_URL')));
  assert.deepEqual(findConfigProblems(buildConfig({ ...base, PUBLIC_BASE_URL: '' })), []);
  const prod = { ...base, NODE_ENV: 'production', FRONTEND_URL: 'https://a.example.com', PUBLIC_BASE_URL: 'http://a.example.com' };
  assert.ok(findConfigProblems(buildConfig(prod)).some((p) => p.includes('PUBLIC_BASE_URL must use https')));
});

test('isDuplicateTokenError only matches duplicate tokenHash errors', () => {
  assert.equal(isDuplicateTokenError({ code: 11000, keyPattern: { tokenHash: 1 } }), true);
  assert.equal(isDuplicateTokenError({ code: 11000, keyPattern: { email: 1 } }), false);
  assert.equal(isDuplicateTokenError({ code: 500 }), false);
  assert.equal(isDuplicateTokenError(null), false);
});
