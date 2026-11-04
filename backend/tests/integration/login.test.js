const { hasMongo, startTestServer, createClient, seedUser } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../config/env');
const { User } = require('../../models');
const { createUser } = require('../../services/userService');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('login API (integration, real MongoDB test database)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer();
  t.after(stop);

  const employee = await seedUser({ name: 'Eve Employee', email: 'eve@example.com' });
  await seedUser({ name: 'Ina Inactive', email: 'ina@example.com', isActive: false });

  await t.test('readiness reports the database as connected; the Phase 1 health check still works', async () => {
    const client = createClient(baseUrl);
    const ready = await client.get('/api/health/ready');
    assert.equal(ready.status, 200);
    assert.equal(ready.json.database, 'connected');
    const health = await client.get('/api/health');
    assert.deepEqual(health.json, { success: true, message: 'Video Response API is running' });
  });

  await t.test('the password is stored only as an Argon2id hash and hidden from normal queries', async () => {
    const stored = await User.findOne({ email: 'eve@example.com' }).select('+passwordHash');
    assert.ok(stored.passwordHash.startsWith('$argon2id$'));
    assert.ok(!stored.passwordHash.includes(employee.password));
    const plain = await User.findOne({ email: 'eve@example.com' });
    assert.equal(plain.passwordHash, undefined);
  });

  await t.test('duplicate emails are rejected case-insensitively', async () => {
    await assert.rejects(
      () => createUser({ name: 'Dup', email: 'EVE@example.com', password: 'another-long-password-1' }),
      { statusCode: 409 }
    );
  });

  await t.test('correct credentials: 200, HttpOnly SameSite=Lax 8h cookie, safe user only', async () => {
    const client = createClient(baseUrl);
    const res = await client.post('/api/auth/login', { email: ' Eve@Example.com ', password: employee.password });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json.user).sort(), ['email', 'id', 'name', 'role']);
    assert.equal(res.json.user.email, 'eve@example.com');

    const cookie = res.setCookies.find((c) => c.startsWith(`${config.session.cookieName}=`));
    assert.ok(cookie, 'session cookie is set');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Max-Age=28800/);
    assert.doesNotMatch(cookie, /Secure/i, 'Secure is only set in production');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.ok(!res.text.includes('argon2') && !res.text.includes('passwordHash'));
  });

  await t.test('wrong password, unknown email and malformed email give the same generic 401', async () => {
    const client = createClient(baseUrl);
    const wrongPassword = await client.post('/api/auth/login', { email: 'eve@example.com', password: 'wrong-password-123' });
    const unknownEmail = await client.post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password-123' });
    const malformed = await client.post('/api/auth/login', { email: 'not-an-email', password: 'x' });
    for (const res of [wrongPassword, unknownEmail, malformed]) {
      assert.equal(res.status, 401);
      assert.equal(res.json.message, 'Invalid email or password');
      assert.equal(res.setCookies.length, 0);
    }
    assert.deepEqual(wrongPassword.json, unknownEmail.json);
  });

  await t.test('missing or non-string fields (including NoSQL operator objects) are rejected with 400', async () => {
    const client = createClient(baseUrl);
    assert.equal((await client.post('/api/auth/login', {})).status, 400);
    assert.equal((await client.post('/api/auth/login', { email: 'eve@example.com' })).status, 400);
    assert.equal((await client.post('/api/auth/login', { email: { $ne: '' }, password: { $ne: '' } })).status, 400);
  });

  await t.test('inactive accounts cannot log in, with the same generic error', async () => {
    const client = createClient(baseUrl);
    const res = await client.post('/api/auth/login', { email: 'ina@example.com', password: 'a-long-test-password-1' });
    assert.equal(res.status, 401);
    assert.equal(res.json.message, 'Invalid email or password');
    assert.equal(res.setCookies.length, 0);
  });
});
