const { hasMongo, startTestServer, createClient, seedUser } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('session security: tokens, CSRF, CORS, errors (integration)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer();
  t.after(stop);
  const employee = await seedUser({ email: 'eve@example.com' });
  const cookieName = config.session.cookieName;
  const claims = {
    algorithm: 'HS256',
    issuer: config.session.issuer,
    audience: config.session.audience,
    subject: employee.id,
  };

  await t.test('invalid, expired, wrongly-signed and orphaned tokens are rejected with 401', async () => {
    const client = createClient(baseUrl);

    client.setCookie(`${cookieName}=garbage`);
    assert.equal((await client.get('/api/auth/me')).status, 401, 'garbage');

    client.setCookie(`${cookieName}=${jwt.sign({}, config.jwtSecret, { ...claims, expiresIn: -60 })}`);
    assert.equal((await client.get('/api/auth/me')).status, 401, 'expired');

    client.setCookie(`${cookieName}=${jwt.sign({}, 'a-completely-different-secret-value-xyz', { ...claims, expiresIn: '1h' })}`);
    assert.equal((await client.get('/api/auth/me')).status, 401, 'wrong signature');

    client.setCookie(`${cookieName}=${jwt.sign({}, config.jwtSecret, { ...claims, expiresIn: '1h', subject: '64b7f0c2a1b2c3d4e5f60718' })}`);
    assert.equal((await client.get('/api/auth/me')).status, 401, 'valid token for a user that does not exist');

    client.setCookie(`${cookieName}=${jwt.sign({}, config.jwtSecret, { ...claims, expiresIn: '1h' })}`);
    assert.equal((await client.get('/api/auth/me')).status, 200, 'sanity check: a correctly signed token works');
  });

  await t.test('CSRF: login and logout from an untrusted or missing Origin are rejected', async () => {
    const client = createClient(baseUrl);
    const body = { email: 'eve@example.com', password: employee.password };

    const evil = await client.post('/api/auth/login', body, { origin: 'https://evil.example' });
    assert.equal(evil.status, 403);
    assert.equal(evil.setCookies.length, 0);

    assert.equal((await client.post('/api/auth/login', body, { origin: null })).status, 403);
    assert.equal((await client.post('/api/auth/logout', undefined, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await client.post('/api/auth/login', body)).status, 200, 'trusted origin still works');
  });

  await t.test('CORS allows credentials only for the configured frontend origin', async () => {
    const client = createClient(baseUrl);
    const good = await client.get('/api/health', { origin: 'http://localhost:5173' });
    assert.equal(good.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(good.headers.get('access-control-allow-credentials'), 'true');
    const bad = await client.get('/api/health', { origin: 'https://evil.example' });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
  });

  await t.test('malformed JSON gets a clean 400 with no stack trace', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: '{bad json',
    });
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.ok(!text.includes('node_modules') && !text.includes(' at '));
  });

  await t.test('unknown API paths return a JSON 404', async () => {
    const res = await createClient(baseUrl).get('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.json.success, false);
  });
});

test('login rate limiting (integration)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer({ loginRateLimit: { limit: 3 } });
  t.after(stop);
  const user = await seedUser({ email: 'rate@example.com' });
  const client = createClient(baseUrl);

  for (let i = 0; i < 3; i += 1) {
    const res = await client.post('/api/auth/login', { email: 'rate@example.com', password: 'wrong-password-123' });
    assert.equal(res.status, 401);
  }
  const blocked = await client.post('/api/auth/login', { email: 'rate@example.com', password: user.password });
  assert.equal(blocked.status, 429, 'even the correct password is blocked once the limit is hit');
  assert.equal(blocked.json.code, 'RATE_LIMITED');
});
