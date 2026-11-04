const { hasMongo, startTestServer, loginAs, tokenFromUrl } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Request } = require('../../models');
const { hashToken } = require('../../services/linkTokenService');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';
const body = { title: 'Project feedback', question: 'What did you like most?' };

test('create request (integration, real MongoDB test database)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer();
  t.after(stop);
  const { user, client } = await loginAs(baseUrl, { email: 'erin@example.com', name: 'Erin' });

  let created;
  await t.test('an authenticated employee can create a request (201) and gets a public URL', async () => {
    const res = await client.post('/api/requests', body);
    assert.equal(res.status, 201);
    assert.equal(res.json.success, true);
    created = res.json;
    assert.equal(created.request.title, body.title);
    assert.equal(created.request.question, body.question);
    assert.equal(created.request.status, 'active');
    assert.equal(created.request.maxDurationSeconds, 120);
    assert.equal(created.request.responseCount, 0);
    assert.equal(created.request.createdBy.id, user.id);
    assert.match(created.url, /^http:\/\/localhost:5173\/respond\/[A-Za-z0-9_-]{43}$/);
  });

  await t.test('the request is saved in MongoDB with a SHA-256 hash and no raw token', async () => {
    const stored = await Request.findById(created.request.id).select('+tokenHash').lean();
    assert.ok(stored, 'document exists in MongoDB');
    assert.equal(String(stored.createdBy), user.id);
    const token = tokenFromUrl(created.url);
    assert.equal(stored.tokenHash, hashToken(token));
    assert.match(stored.tokenHash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(stored).includes(token), 'the raw token appears nowhere in the stored document');
    assert.ok(stored.tokenIssuedAt instanceof Date);
  });

  await t.test('the API response never contains tokenHash', async () => {
    const stored = await Request.findById(created.request.id).select('+tokenHash').lean();
    assert.ok(!JSON.stringify(created).includes(stored.tokenHash));
    assert.ok(!('tokenHash' in created.request));
  });

  await t.test('different requests get different tokens and hashes', async () => {
    const urls = new Set([created.url]);
    for (let i = 0; i < 5; i += 1) {
      const res = await client.post('/api/requests', { ...body, title: `Another ${i}` });
      assert.equal(res.status, 201);
      urls.add(res.json.url);
    }
    assert.equal(urls.size, 6);
    const hashes = (await Request.find({}).select('+tokenHash').lean()).map((r) => r.tokenHash);
    assert.equal(new Set(hashes).size, hashes.length);
  });

  await t.test('optional expiration is saved', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const res = await client.post('/api/requests', { ...body, expiresAt });
    assert.equal(res.status, 201);
    assert.equal(new Date(res.json.request.expiresAt).toISOString(), expiresAt);
    assert.equal(res.json.request.effectiveStatus, 'active');
  });

  await t.test('text is trimmed and stored as plain text (HTML is not interpreted)', async () => {
    const res = await client.post('/api/requests', { title: '  <b>Hi</b>  ', question: '<img src=x onerror=alert(1)>' });
    assert.equal(res.status, 201);
    assert.equal(res.json.request.title, '<b>Hi</b>');
    assert.equal(res.json.request.question, '<img src=x onerror=alert(1)>');
  });
});
