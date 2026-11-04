const { hasMongo, startTestServer, createClient, loginAs, tokenFromUrl } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Request } = require('../../models');
const { generateToken } = require('../../services/linkTokenService');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('public question API (integration)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer();
  t.after(stop);
  const { user, client } = await loginAs(baseUrl, { email: 'erin@example.com', name: 'Erin Employee' });
  const created = (await client.post('/api/requests', { title: 'Public title', question: 'Public <b>question</b>?' })).json;
  const token = tokenFromUrl(created.url);
  const anon = createClient(baseUrl); // never logs in: no cookie at all

  await t.test('works without login and returns only title, question and max duration', async () => {
    const res = await anon.get(`/api/public/${token}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      success: true,
      request: { title: 'Public title', question: 'Public <b>question</b>?', maxDurationSeconds: 120 },
    });
  });

  await t.test('does not leak employee details, ids, hashes or timestamps', async () => {
    const res = await anon.get(`/api/public/${token}`);
    const stored = await Request.findById(created.request.id).select('+tokenHash').lean();
    for (const secret of [user.id, user.email, 'Erin Employee', created.request.id, stored.tokenHash, 'createdBy', 'tokenHash', '_id', 'createdAt']) {
      assert.ok(!res.text.includes(secret), `response must not contain ${secret}`);
    }
  });

  await t.test('is not cacheable and does not leak the token through referrers', async () => {
    const res = await anon.get(`/api/public/${token}`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  });

  await t.test('invalid tokens are rejected with the same generic response', async () => {
    const bad = ['abc', 'a'.repeat(43), generateToken(), token.slice(1), token + 'x', token.slice(0, 42) + '+', '..%2F..%2Fetc', '%00', 'a'.repeat(5000)];
    const bodies = new Set();
    for (const value of bad) {
      const res = await anon.get(`/api/public/${value}`);
      assert.equal(res.status, 404, value.slice(0, 30));
      assert.equal(res.json.code, 'LINK_UNAVAILABLE');
      bodies.add(res.text);
    }
    assert.equal(bodies.size, 1, 'every invalid case produces an identical body');
  });

  await t.test('closed, expired and unknown links are indistinguishable', async () => {
    const unknown = await anon.get(`/api/public/${generateToken()}`);

    await client.patch(`/api/requests/${created.request.id}`, { status: 'closed' });
    const closed = await anon.get(`/api/public/${token}`);
    await client.patch(`/api/requests/${created.request.id}`, { status: 'active' });

    await Request.updateOne({ _id: created.request.id }, { expiresAt: new Date(Date.now() - 60000) });
    const expired = await anon.get(`/api/public/${token}`);
    await Request.updateOne({ _id: created.request.id }, { $unset: { expiresAt: 1 } });

    for (const res of [closed, expired]) {
      assert.equal(res.status, 404);
      assert.equal(res.text, unknown.text);
    }
    assert.equal((await anon.get(`/api/public/${token}`)).status, 200, 'works again once active and not expired');
  });

  await t.test('a request with a future expiry is accessible; it stops at the expiry time', async () => {
    await Request.updateOne({ _id: created.request.id }, { expiresAt: new Date(Date.now() + 1500) });
    assert.equal((await anon.get(`/api/public/${token}`)).status, 200);
    await new Promise((r) => setTimeout(r, 1800));
    assert.equal((await anon.get(`/api/public/${token}`)).status, 404);
    await Request.updateOne({ _id: created.request.id }, { $unset: { expiresAt: 1 } });
  });

  await t.test('there is no public listing endpoint', async () => {
    for (const path of ['/api/public', '/api/public/', '/api/public/list', '/api/public?all=1']) {
      const res = await anon.get(path);
      assert.notEqual(res.status, 200, path);
      assert.ok(!res.text.includes('Public title'), path);
    }
  });

  await t.test('a token looked up as a hash does not work (the stored value is not a credential)', async () => {
    const stored = await Request.findById(created.request.id).select('+tokenHash').lean();
    assert.equal((await anon.get(`/api/public/${stored.tokenHash}`)).status, 404);
    assert.equal((await anon.get(`/api/public/${stored.tokenHash.slice(0, 43)}`)).status, 404);
  });

  await t.test('public endpoint is GET only', async () => {
    const res = await anon.post(`/api/public/${token}`, {});
    assert.notEqual(res.status, 200);
  });
});

test('public endpoint rate limiting (integration)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer({ loginRateLimit: { limit: 1000 }, publicRateLimit: { limit: 4 } });
  t.after(stop);
  const anon = createClient(baseUrl);
  for (let i = 0; i < 4; i += 1) assert.equal((await anon.get(`/api/public/${generateToken()}`)).status, 404);
  const limited = await anon.get(`/api/public/${generateToken()}`);
  assert.equal(limited.status, 429);
  assert.equal(limited.json.code, 'RATE_LIMITED');
});
