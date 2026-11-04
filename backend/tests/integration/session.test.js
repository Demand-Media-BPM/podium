const { hasMongo, startTestServer, createClient, seedUser } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../config/env');
const { User } = require('../../models');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('session API: me and logout (integration, real MongoDB test database)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer();
  t.after(stop);

  const employee = await seedUser({ name: 'Eve Employee', email: 'eve@example.com' });
  const admin = await seedUser({ name: 'Ada Admin', email: 'ada@example.com', role: 'admin' });

  await t.test('/api/auth/me returns only safe fields with a valid cookie', async () => {
    const client = createClient(baseUrl);
    await client.post('/api/auth/login', { email: 'ada@example.com', password: admin.password });
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json.user).sort(), ['email', 'id', 'name', 'role']);
    assert.equal(res.json.user.role, 'admin');
    assert.ok(!res.text.includes('passwordHash') && !res.text.includes('argon2'));
  });

  await t.test('/api/auth/me without a cookie is 401', async () => {
    const res = await createClient(baseUrl).get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'UNAUTHENTICATED');
  });

  await t.test('deactivating a user ends their existing session immediately', async () => {
    const victim = await seedUser({ name: 'Vic Victim', email: 'vic@example.com' });
    const client = createClient(baseUrl);
    await client.post('/api/auth/login', { email: 'vic@example.com', password: victim.password });
    assert.equal((await client.get('/api/auth/me')).status, 200);
    await User.updateOne({ _id: victim.id }, { isActive: false });
    assert.equal((await client.get('/api/auth/me')).status, 401);
  });

  await t.test('logout clears the cookie with matching attributes and ends the session', async () => {
    const client = createClient(baseUrl);
    await client.post('/api/auth/login', { email: 'eve@example.com', password: employee.password });
    assert.equal((await client.get('/api/auth/me')).status, 200);

    const res = await client.post('/api/auth/logout');
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    const cleared = res.setCookies.find((c) => c.startsWith(`${config.session.cookieName}=`));
    assert.ok(cleared);
    assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
    assert.match(cleared, /HttpOnly/i);
    assert.match(cleared, /SameSite=Lax/i);
    assert.match(cleared, /Path=\//);
    assert.equal(client.getCookie(), '');
    assert.equal((await client.get('/api/auth/me')).status, 401);
  });
});
