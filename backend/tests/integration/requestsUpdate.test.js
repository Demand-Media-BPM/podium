const { hasMongo, startTestServer, createClient, loginAs, tokenFromUrl } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Request } = require('../../models');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('edit, close and reopen requests (integration)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer();
  t.after(stop);
  const { user, client } = await loginAs(baseUrl, { email: 'erin@example.com', name: 'Erin' });
  const created = (await client.post('/api/requests', { title: 'Original', question: 'Original question' })).json;
  const id = created.request.id;
  const token = tokenFromUrl(created.url);
  const anon = createClient(baseUrl);

  await t.test('PATCH updates title and question in MongoDB', async () => {
    const res = await client.patch(`/api/requests/${id}`, { title: '  New title ', question: 'New question?' });
    assert.equal(res.status, 200);
    assert.equal(res.json.request.title, 'New title');
    const stored = await Request.findById(id).lean();
    assert.equal(stored.title, 'New title');
    assert.equal(stored.question, 'New question?');
    assert.ok(stored.updatedAt > stored.createdAt);
  });

  await t.test('the public page shows the edited question immediately; the link is unchanged', async () => {
    const res = await anon.get(`/api/public/${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.request.question, 'New question?');
    assert.equal(res.json.request.title, 'New title');
  });

  await t.test('closing a request makes its public link unavailable; reopening restores the same link', async () => {
    const closed = await client.patch(`/api/requests/${id}`, { status: 'closed' });
    assert.equal(closed.json.request.status, 'closed');
    assert.equal(closed.json.request.effectiveStatus, 'closed');
    assert.equal((await anon.get(`/api/public/${token}`)).status, 404);

    const reopened = await client.patch(`/api/requests/${id}`, { status: 'active' });
    assert.equal(reopened.json.request.effectiveStatus, 'active');
    assert.equal((await anon.get(`/api/public/${token}`)).status, 200);
  });

  await t.test('setting a future expiry works; clearing it with null removes it', async () => {
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    const set = await client.patch(`/api/requests/${id}`, { expiresAt });
    assert.equal(new Date(set.json.request.expiresAt).toISOString(), expiresAt);
    assert.ok((await Request.findById(id).lean()).expiresAt);

    const cleared = await client.patch(`/api/requests/${id}`, { expiresAt: null });
    assert.equal(cleared.json.request.expiresAt, null);
    assert.equal((await Request.findById(id).lean()).expiresAt, undefined);
  });

  await t.test('protected fields cannot be changed: createdBy, tokenHash, maxDurationSeconds, _id', async () => {
    const before = await Request.findById(id).select('+tokenHash').lean();
    for (const extra of [{ createdBy: '64b7f0c2a1b2c3d4e5f60718' }, { tokenHash: 'b'.repeat(64) }, { maxDurationSeconds: 5 }, { _id: '64b7f0c2a1b2c3d4e5f60718' }]) {
      const res = await client.patch(`/api/requests/${id}`, { title: 'Sneaky', ...extra });
      assert.equal(res.status, 400, JSON.stringify(extra));
    }
    const after = await Request.findById(id).select('+tokenHash').lean();
    assert.equal(after.title, before.title, 'nothing was applied');
    assert.equal(String(after.createdBy), user.id);
    assert.equal(after.tokenHash, before.tokenHash);
    assert.equal(after.maxDurationSeconds, 120);
  });

  await t.test('invalid values and empty updates are rejected without changing data', async () => {
    const before = await Request.findById(id).lean();
    for (const bad of [{ title: '' }, { title: 'a'.repeat(151) }, { question: '  ' }, { status: 'expired' }, { status: 'deleted' }, { expiresAt: '2001-01-01' }, {}]) {
      assert.equal((await client.patch(`/api/requests/${id}`, bad)).status, 400, JSON.stringify(bad));
    }
    const after = await Request.findById(id).lean();
    assert.equal(after.title, before.title);
    assert.equal(after.status, before.status);
  });

  await t.test('PATCH requires auth and a trusted origin', async () => {
    assert.equal((await anon.patch(`/api/requests/${id}`, { title: 'x' })).status, 401);
    assert.equal((await client.patch(`/api/requests/${id}`, { title: 'x' }, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await client.patch(`/api/requests/${id}`, { title: 'x' }, { origin: null })).status, 403);
    assert.equal((await Request.findById(id).lean()).title, 'New title');
  });

  await t.test('there is no delete endpoint (Phase 3 does not delete requests)', async () => {
    const res = await fetch(`${baseUrl}/api/requests/${id}`, {
      method: 'DELETE',
      headers: { Origin: 'http://localhost:5173', Cookie: client.getCookie() },
    });
    assert.equal(res.status, 404);
    assert.ok(await Request.findById(id));
  });
});
