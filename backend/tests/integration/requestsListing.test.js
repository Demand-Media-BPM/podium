const { hasMongo, startTestServer, loginAs } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Request, Response } = require('../../models');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('listing, pagination, summary and response counts (integration)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer();
  t.after(stop);

  const erin = await loginAs(baseUrl, { name: 'Erin', email: 'erin@example.com' });
  const ada = await loginAs(baseUrl, { name: 'Ada', email: 'ada@example.com', role: 'admin' });
  const ids = [];
  for (let i = 1; i <= 7; i += 1) {
    const res = await erin.client.post('/api/requests', { title: `Request ${i}`, question: `Question ${i}` });
    ids.push(res.json.request.id);
  }
  const lastId = ids[6];

  await t.test('lists newest first with pagination metadata', async () => {
    const page1 = await erin.client.get('/api/requests?page=1&limit=3');
    assert.deepEqual(page1.json.requests.map((r) => r.title), ['Request 7', 'Request 6', 'Request 5']);
    assert.deepEqual(page1.json.pagination, { page: 1, limit: 3, total: 7, totalPages: 3 });
    const page3 = await erin.client.get('/api/requests?page=3&limit=3');
    assert.deepEqual(page3.json.requests.map((r) => r.title), ['Request 1']);
    const beyond = await erin.client.get('/api/requests?page=9&limit=3');
    assert.equal(beyond.status, 200);
    assert.deepEqual(beyond.json.requests, []);
  });

  await t.test('invalid pagination values are rejected', async () => {
    // 'page=1&page=2' reaches the server as an array, which must be rejected rather than coerced.
    for (const q of ['page=0', 'limit=0', 'limit=51', 'page=abc', 'limit=1e3', 'page=1&page=2', 'limit=5&limit=6', 'page=-1', 'page=1.5']) {
      assert.equal((await erin.client.get(`/api/requests?${q}`)).status, 400, q);
    }
    // Express 5 does not parse bracket syntax, so 'page[]' is just an unknown key that is ignored (defaults apply).
    const ignored = await erin.client.get('/api/requests?page[]=1&limit[$gt]=0');
    assert.equal(ignored.status, 200);
    assert.deepEqual(ignored.json.pagination, { page: 1, limit: 10, total: 7, totalPages: 1 });
  });

  await t.test('summary counts requests, active requests and submitted responses', async () => {
    await erin.client.patch(`/api/requests/${ids[0]}`, { status: 'closed' });
    await Request.updateOne({ _id: ids[1] }, { expiresAt: new Date(Date.now() - 1000) });
    await Response.create({ requestId: lastId, status: 'submitted' });
    await Response.create({ requestId: lastId, status: 'pending_upload' });
    await Response.create({ requestId: lastId, status: 'failed' });

    const { summary } = (await erin.client.get('/api/requests/summary')).json;
    assert.equal(summary.totalRequests, 7);
    assert.equal(summary.activeRequests, 5, 'closed and expired requests are not active');
    assert.equal(summary.totalResponses, 1, 'only submitted responses are counted');
  });

  await t.test('list items carry effectiveStatus and real response counts', async () => {
    const list = (await erin.client.get('/api/requests?limit=50')).json.requests;
    const byTitle = Object.fromEntries(list.map((r) => [r.title, r]));
    assert.equal(byTitle['Request 1'].effectiveStatus, 'closed');
    assert.equal(byTitle['Request 2'].effectiveStatus, 'expired');
    assert.equal(byTitle['Request 2'].status, 'active');
    assert.equal(byTitle['Request 3'].effectiveStatus, 'active');
    assert.equal(byTitle['Request 7'].responseCount, 1);
    assert.equal(byTitle['Request 6'].responseCount, 0);
  });

  await t.test('an admin summary covers every employee', async () => {
    await ada.client.post('/api/requests', { title: 'Ada request', question: 'Q' });
    assert.equal((await ada.client.get('/api/requests/summary')).json.summary.totalRequests, 8);
    assert.equal((await erin.client.get('/api/requests/summary')).json.summary.totalRequests, 7);
  });

  await t.test('no endpoint returns token hashes', async () => {
    const hash = (await Request.findById(lastId).select('+tokenHash').lean()).tokenHash;
    for (const path of ['/api/requests', `/api/requests/${lastId}`, '/api/requests/summary']) {
      const res = await ada.client.get(path);
      assert.ok(!res.text.includes(hash) && !/tokenHash/.test(res.text), path);
    }
  });
});
