require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const { signSessionToken, verifySessionToken } = require('../../services/tokenService');

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const baseClaims = { issuer: config.session.issuer, audience: config.session.audience, subject: USER_ID };

test('a signed token verifies and carries only the user id as subject', () => {
  const payload = verifySessionToken(signSessionToken(USER_ID));
  assert.equal(payload.sub, USER_ID);
  assert.ok(!('role' in payload) && !('email' in payload) && !('name' in payload));
});

test('the token expires in 8 hours', () => {
  const payload = verifySessionToken(signSessionToken(USER_ID));
  assert.equal(payload.exp - payload.iat, 8 * 60 * 60);
});

test('an expired token is rejected', () => {
  const expired = jwt.sign({}, config.jwtSecret, { algorithm: 'HS256', ...baseClaims, expiresIn: -10 });
  assert.throws(() => verifySessionToken(expired), { name: 'TokenExpiredError' });
});

test('a token signed with a different secret is rejected', () => {
  const forged = jwt.sign({}, 'another-secret-another-secret-another-secret', { ...baseClaims, expiresIn: '1h' });
  assert.throws(() => verifySessionToken(forged), { name: 'JsonWebTokenError' });
});

test('a tampered token is rejected', () => {
  const [header, payload, signature] = signSessionToken(USER_ID).split('.');
  const evilPayload = Buffer.from(JSON.stringify({ sub: 'ffffffffffffffffffffffff', exp: 9999999999 })).toString('base64url');
  assert.throws(() => verifySessionToken(`${header}.${evilPayload}.${signature}`));
  assert.ok(payload);
});

test('an unsigned ("alg: none") token is rejected', () => {
  const none = jwt.sign({}, '', { algorithm: 'none', ...baseClaims });
  assert.throws(() => verifySessionToken(none));
});

test('a token for a different audience or issuer is rejected', () => {
  const wrongAudience = jwt.sign({}, config.jwtSecret, { ...baseClaims, audience: 'someone-else', expiresIn: '1h' });
  const wrongIssuer = jwt.sign({}, config.jwtSecret, { ...baseClaims, issuer: 'someone-else', expiresIn: '1h' });
  assert.throws(() => verifySessionToken(wrongAudience));
  assert.throws(() => verifySessionToken(wrongIssuer));
});

test('garbage is rejected', () => {
  assert.throws(() => verifySessionToken('not.a.jwt'));
  assert.throws(() => verifySessionToken(''));
});
