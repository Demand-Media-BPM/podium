const { hasMongo, startTestServer, createClient, loginAs } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Request } = require('../../models');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';
const body = { title: 'Project feedback', question: 'What did you like most?' };

test('create request validation and security (integration)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer();
  t.after(stop);
  const { client } = await loginAs(baseUrl, { email: 'erin@example.com' });
  const count = () => Request.countDocuments();

  await t.test('missing, blank and over-long fields give 400 with per-field details and save nothing', async () => {
    const n = await count();
    const missing = await client.post('/api/requests', {});
    assert.equal(missing.status, 400);
    assert.ok(missing.json.details.title && missing.json.details.question);
    const longTitle = await client.post('/api/requests', { title: 'a'.repeat(151), question: 'q' });
    assert.ok(longTitle.json.details.title.includes('150'));
    const longQuestion = await client.post('/api/requests', { title: 't', question: 'q'.repeat(2001) });
    assert.ok(longQuestion.json.details.question.includes('2000'));
    assert.equal((await client.post('/api/requests', { title: '   ', question: 'q' })).status, 400);
    assert.equal(await count(), n, 'no documents were created');
  });

  await t.test('past, malformed and far-future expiry dates are rejected', async () => {
    for (const expiresAt of ['2020-01-01T00:00:00Z', 'tomorrow', '2999-01-01T00:00:00Z', 5]) {
      const res = await client.post('/api/requests', { ...body, expiresAt });
      assert.equal(res.status, 400, String(expiresAt));
      assert.ok(res.json.details.expiresAt);
    }
  });

  await t.test('mass assignment is rejected: createdBy, tokenHash, status, maxDurationSeconds, _id', async () => {
    const n = await count();
    const extras = [{ createdBy: '64b7f0c2a1b2c3d4e5f60718' }, { tokenHash: 'a'.repeat(64) }, { status: 'closed' }, { maxDurationSeconds: 9999 }, { _id: '64b7f0c2a1b2c3d4e5f60718' }];
    for (const extra of extras) {
      const res = await client.post('/api/requests', { ...body, ...extra });
      assert.equal(res.status, 400, JSON.stringify(extra));
    }
    assert.equal(await count(), n);
  });

  await t.test('unauthenticated users cannot create or list requests (401)', async () => {
    const anon = createClient(baseUrl);
    assert.equal((await anon.post('/api/requests', body)).status, 401);
    assert.equal((await anon.get('/api/requests')).status, 401);
    assert.equal((await anon.get('/api/requests/summary')).status, 401);
  });

  await t.test('CSRF: creating from an untrusted or missing Origin is rejected (403)', async () => {
    const n = await count();
    assert.equal((await client.post('/api/requests', body, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await client.post('/api/requests', body, { origin: null })).status, 403);
    assert.equal(await count(), n);
  });

  await t.test('non-object bodies are clean 400s', async () => {
    assert.equal((await client.post('/api/requests', [body])).status, 400);
    assert.equal((await client.post('/api/requests', 'just a string')).status, 400);
  });

  await t.test('responses are not cacheable', async () => {
    const res = await client.post('/api/requests', body);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
});
