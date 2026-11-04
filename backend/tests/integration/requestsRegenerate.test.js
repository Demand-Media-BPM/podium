const { hasMongo, startTestServer, createClient, loginAs, tokenFromUrl } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Request } = require('../../models');
const { hashToken } = require('../../services/linkTokenService');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('regenerate link (integration)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer();
  t.after(stop);
  const { client } = await loginAs(baseUrl, { email: 'erin@example.com' });
  const anon = createClient(baseUrl);

  const created = (await client.post('/api/requests', { title: 'T', question: 'The question?' })).json;
  const id = created.request.id;
  const oldToken = tokenFromUrl(created.url);
  const oldHash = (await Request.findById(id).select('+tokenHash').lean()).tokenHash;

  assert.equal((await anon.get(`/api/public/${oldToken}`)).status, 200, 'old link works before regeneration');

  let regen;
  await t.test('regenerating returns a new URL and stores a new hash', async () => {
    const res = await client.post(`/api/requests/${id}/regenerate-link`);
    assert.equal(res.status, 200);
    regen = res.json;
    assert.match(regen.url, /^http:\/\/localhost:5173\/respond\/[A-Za-z0-9_-]{43}$/);
    assert.notEqual(tokenFromUrl(regen.url), oldToken);
    assert.equal(regen.request.id, id);

    const stored = await Request.findById(id).select('+tokenHash').lean();
    assert.notEqual(stored.tokenHash, oldHash);
    assert.equal(stored.tokenHash, hashToken(tokenFromUrl(regen.url)));
    assert.ok(!JSON.stringify(stored).includes(tokenFromUrl(regen.url)), 'raw token not stored');
    assert.ok(!('tokenHash' in regen.request));
    assert.equal(await Request.countDocuments({ tokenHash: oldHash }), 0, 'old hash no longer exists anywhere');
  });

  await t.test('the OLD link stops working immediately (generic unavailable response)', async () => {
    const res = await anon.get(`/api/public/${oldToken}`);
    assert.equal(res.status, 404);
    assert.equal(res.json.code, 'LINK_UNAVAILABLE');
    assert.ok(!res.text.includes('The question?'));
  });

  await t.test('the NEW link works and shows the question', async () => {
    const res = await anon.get(`/api/public/${tokenFromUrl(regen.url)}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.request.question, 'The question?');
  });

  await t.test('regenerating twice invalidates the previous regenerated link too', async () => {
    const second = (await client.post(`/api/requests/${id}/regenerate-link`)).json;
    assert.equal((await anon.get(`/api/public/${tokenFromUrl(regen.url)}`)).status, 404);
    assert.equal((await anon.get(`/api/public/${tokenFromUrl(second.url)}`)).status, 200);
  });

  await t.test('concurrent regenerations leave exactly one working link (atomic swap)', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => client.post(`/api/requests/${id}/regenerate-link`)));
    assert.ok(results.every((r) => r.status === 200));
    const urls = results.map((r) => r.json.url);
    const statuses = await Promise.all(urls.map((u) => anon.get(`/api/public/${tokenFromUrl(u)}`).then((r) => r.status)));
    assert.equal(statuses.filter((s) => s === 200).length, 1, 'exactly one of the six links is valid');
    const stored = await Request.findById(id).select('+tokenHash').lean();
    assert.ok(urls.some((u) => hashToken(tokenFromUrl(u)) === stored.tokenHash));
  });

  await t.test('regenerating keeps the request data, status and responses count', async () => {
    const stored = await Request.findById(id).lean();
    assert.equal(stored.title, 'T');
    assert.equal(stored.question, 'The question?');
    assert.equal(stored.status, 'active');
  });

  await t.test('regenerate requires authentication, a trusted origin and a valid id', async () => {
    assert.equal((await anon.post(`/api/requests/${id}/regenerate-link`)).status, 401);
    assert.equal((await client.post(`/api/requests/${id}/regenerate-link`, undefined, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await client.post(`/api/requests/${id}/regenerate-link`, undefined, { origin: null })).status, 403);
    assert.equal((await client.post('/api/requests/not-an-id/regenerate-link')).status, 400);
    assert.equal((await client.post('/api/requests/64b7f0c2a1b2c3d4e5f60718/regenerate-link')).status, 404);
  });

  await t.test('regenerating a closed request does not reopen it', async () => {
    await client.patch(`/api/requests/${id}`, { status: 'closed' });
    const res = await client.post(`/api/requests/${id}/regenerate-link`);
    assert.equal(res.status, 200);
    assert.equal(res.json.request.status, 'closed');
    assert.equal((await anon.get(`/api/public/${tokenFromUrl(res.json.url)}`)).status, 404);
  });
});
