const { hasMongo, startTestServer, createClient, loginAs, tokenFromUrl } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Request } = require('../../models');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('authorization: ownership and admin access (integration)', { skip }, async (t) => {
  const { baseUrl, stop } = await startTestServer();
  t.after(stop);

  const erin = await loginAs(baseUrl, { name: 'Erin', email: 'erin@example.com' });
  const finn = await loginAs(baseUrl, { name: 'Finn', email: 'finn@example.com' });
  const ada = await loginAs(baseUrl, { name: 'Ada', email: 'ada@example.com', role: 'admin' });

  const erinReq = (await erin.client.post('/api/requests', { title: 'Erin request', question: 'Q1' })).json;
  const finnReq = (await finn.client.post('/api/requests', { title: 'Finn request', question: 'Q2' })).json;
  const erinId = erinReq.request.id;

  await t.test('an employee lists only their own requests', async () => {
    const res = await erin.client.get('/api/requests');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.requests.map((r) => r.title), ['Erin request']);
    assert.equal(res.json.pagination.total, 1);
  });

  await t.test('an employee cannot read, edit or regenerate another employee request (404, nothing leaked)', async () => {
    const before = await Request.findById(erinId).select('+tokenHash').lean();

    const read = await finn.client.get(`/api/requests/${erinId}`);
    assert.equal(read.status, 404);
    assert.equal(read.json.message, 'Request not found');
    assert.ok(!read.text.includes('Erin request'));

    assert.equal((await finn.client.patch(`/api/requests/${erinId}`, { title: 'hijacked', status: 'closed' })).status, 404);
    assert.equal((await finn.client.post(`/api/requests/${erinId}/regenerate-link`)).status, 404);

    const after = await Request.findById(erinId).select('+tokenHash').lean();
    assert.equal(after.title, 'Erin request', 'title unchanged');
    assert.equal(after.status, 'active', 'status unchanged');
    assert.equal(after.tokenHash, before.tokenHash, 'link was not regenerated');
  });

  await t.test('the owner link still works after those attempts', async () => {
    const res = await createClient(baseUrl).get(`/api/public/${tokenFromUrl(erinReq.url)}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.request.question, 'Q1');
  });

  await t.test('an admin lists and reads all requests and sees who created them', async () => {
    const list = await ada.client.get('/api/requests');
    assert.equal(list.status, 200);
    assert.equal(list.json.pagination.total, 2);
    assert.deepEqual(list.json.requests.map((r) => r.title).sort(), ['Erin request', 'Finn request']);
    assert.deepEqual(list.json.requests.map((r) => r.createdBy.name).sort(), ['Erin', 'Finn']);
    const one = await ada.client.get(`/api/requests/${finnReq.request.id}`);
    assert.equal(one.status, 200);
    assert.equal(one.json.request.title, 'Finn request');
  });

  await t.test('an admin can edit and regenerate links for any request', async () => {
    const patch = await ada.client.patch(`/api/requests/${erinId}`, { title: 'Edited by admin' });
    assert.equal(patch.status, 200);
    assert.equal((await Request.findById(erinId).lean()).title, 'Edited by admin');
    const regen = await ada.client.post(`/api/requests/${erinId}/regenerate-link`);
    assert.equal(regen.status, 200);
    assert.match(regen.json.url, /\/respond\/[A-Za-z0-9_-]{43}$/);
  });

  await t.test('malformed ids are rejected with 400 before touching the database', async () => {
    for (const id of ['abc', '123456789012', '%7B%24ne%3A1%7D', 'zzzzzzzzzzzzzzzzzzzzzzzz']) {
      const res = await erin.client.get(`/api/requests/${id}`);
      assert.equal(res.status, 400, id);
      assert.equal(res.json.code, 'INVALID_ID');
    }
    assert.equal((await erin.client.patch('/api/requests/abc', { title: 'x' })).status, 400);
    assert.equal((await erin.client.post('/api/requests/abc/regenerate-link')).status, 400);
  });

  await t.test('a well-formed id that does not exist is 404', async () => {
    assert.equal((await erin.client.get('/api/requests/64b7f0c2a1b2c3d4e5f60718')).status, 404);
  });
});
