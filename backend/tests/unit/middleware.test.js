require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { requireTrustedOrigin } = require('../../middleware/csrf');
const { isAdmin, ownerFilter, canAccessOwnedResource } = require('../../utils/access');

const cookieName = config.session.cookieName;
const fakeReq = (cookies) => ({ cookies });

test('requireAuth rejects a request with no cookie (401)', async () => {
  await assert.rejects(() => requireAuth(fakeReq({}), {}, () => {}), { statusCode: 401 });
  await assert.rejects(() => requireAuth({}, {}, () => {}), { statusCode: 401 });
});

test('requireAuth rejects a garbage token (401)', async () => {
  await assert.rejects(() => requireAuth(fakeReq({ [cookieName]: 'garbage' }), {}, () => {}), { statusCode: 401 });
});

test('requireAuth rejects an expired token (401)', async () => {
  const expired = jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256',
    issuer: config.session.issuer,
    audience: config.session.audience,
    subject: '64b7f0c2a1b2c3d4e5f60718',
    expiresIn: -5,
  });
  await assert.rejects(() => requireAuth(fakeReq({ [cookieName]: expired }), {}, () => {}), { statusCode: 401 });
});

test('requireAuth rejects a valid token whose subject is not an ObjectId (401)', async () => {
  const token = jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256',
    issuer: config.session.issuer,
    audience: config.session.audience,
    subject: 'not-an-object-id',
    expiresIn: '1h',
  });
  await assert.rejects(() => requireAuth(fakeReq({ [cookieName]: token }), {}, () => {}), { statusCode: 401 });
});

test('requireRole: employees are limited, admins always pass', () => {
  const guard = requireRole('employee');
  const adminOnly = requireRole('admin');
  let passed = false;
  const next = () => {
    passed = true;
  };

  guard({ user: { role: 'employee' } }, {}, next);
  assert.equal(passed, true);

  passed = false;
  assert.throws(() => adminOnly({ user: { role: 'employee' } }, {}, next), { statusCode: 403 });
  assert.equal(passed, false);

  adminOnly({ user: { role: 'admin' } }, {}, next);
  assert.equal(passed, true);

  assert.throws(() => adminOnly({}, {}, next), { statusCode: 401 });
});

test('ownership helpers: admins see everything, employees only their own', () => {
  const admin = { id: 'a1', role: 'admin' };
  const employee = { id: 'e1', role: 'employee' };

  assert.equal(isAdmin(admin), true);
  assert.equal(isAdmin(employee), false);
  assert.deepEqual(ownerFilter(admin), {});
  assert.deepEqual(ownerFilter(employee), { createdBy: 'e1' });
  assert.equal(canAccessOwnedResource(admin, 'someone-else'), true);
  assert.equal(canAccessOwnedResource(employee, 'e1'), true);
  assert.equal(canAccessOwnedResource(employee, 'someone-else'), false);
  assert.equal(canAccessOwnedResource(employee, null), false);
});

function runCsrf(req) {
  let error = 'not-called';
  requireTrustedOrigin(['http://localhost:5173'])(
    { get: (h) => req.headers?.[h.toLowerCase()], method: req.method },
    {},
    (err) => {
      error = err;
    }
  );
  return error;
}

test('CSRF: safe methods pass without an Origin header', () => {
  assert.equal(runCsrf({ method: 'GET', headers: {} }), undefined);
});

test('CSRF: POST from the trusted origin passes', () => {
  assert.equal(runCsrf({ method: 'POST', headers: { origin: 'http://localhost:5173' } }), undefined);
});

test('CSRF: POST from another origin is rejected (403)', () => {
  const err = runCsrf({ method: 'POST', headers: { origin: 'https://evil.example' } });
  assert.equal(err.statusCode, 403);
});

test('CSRF: POST with no Origin or Referer is rejected (403)', () => {
  assert.equal(runCsrf({ method: 'POST', headers: {} }).statusCode, 403);
});

test('CSRF: Referer is used as a fallback and must match too', () => {
  assert.equal(runCsrf({ method: 'DELETE', headers: { referer: 'http://localhost:5173/dashboard' } }), undefined);
  assert.equal(runCsrf({ method: 'DELETE', headers: { referer: 'https://evil.example/x' } }).statusCode, 403);
});

test('CSRF: lookalike origins are rejected', () => {
  assert.equal(runCsrf({ method: 'POST', headers: { origin: 'http://localhost:5173.evil.example' } }).statusCode, 403);
  assert.equal(runCsrf({ method: 'POST', headers: { origin: 'null' } }).statusCode, 403);
});
