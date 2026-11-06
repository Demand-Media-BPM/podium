const { hasMongo } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Response } = require('../../models');
const videoStore = require('../../services/videoStore');
const { setupAccess } = require('../helpers/accessSetup');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('employee access to responses: listing and counts (integration)', { skip }, async (t) => {
  const { alice, bob, admin, anon, aliceRequest, bobRequest, emptyRequest, listOf } = await setupAccess(t);

  await t.test('an employee sees the responses of their own request, oldest first', async () => {
    const res = await listOf(alice.client, aliceRequest);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.responses.map((r) => r.clientName), ['First', 'Second']);
    assert.equal(res.json.pagination.total, 2);
    const [row] = res.json.responses;
    assert.deepEqual(
      Object.keys(row).sort(),
      ['clientEmail', 'clientName', 'createdAt', 'deleteAt', 'durationSeconds', 'effectiveStatus', 'expiredAt', 'fileSize', 'id', 'mimeType', 'playable', 'status', 'storageProvider', 'submittedAt']
    );
    assert.equal(row.clientEmail, 'first@example.com');
    assert.equal(row.status, 'submitted');
    assert.equal(row.durationSeconds, 42.5);
  });

  await t.test('responses never contain storage keys, file paths, or other requests', async () => {
    const res = await listOf(alice.client, aliceRequest);
    const doc = await Response.findOne({ clientName: 'First' }).select('+videoKey').lean();
    // `storageProvider` ("local"/"s3") is allowed since Phase 5; keys, paths and upload credentials never are.
    for (const secret of [doc.videoKey, videoStore.rootDir, 'videoKey', 'uploadKey', 'uploadTokenHash', 'requestId', 'Third', 'submissionId']) {
      assert.ok(!res.text.includes(secret), `must not contain ${secret}`);
    }
  });

  await t.test("an employee cannot see another employee's responses (404, same as a missing request)", async () => {
    const forbidden = await listOf(bob.client, aliceRequest);
    const missing = await bob.client.get(`/api/requests/${'0'.repeat(24)}/responses`);
    assert.equal(forbidden.status, 404);
    assert.equal(forbidden.text, missing.text);
    assert.ok(!forbidden.text.includes('First'));
  });

  await t.test('an admin can see responses of any request', async () => {
    assert.equal((await listOf(admin.client, aliceRequest)).json.pagination.total, 2);
    assert.equal((await listOf(admin.client, bobRequest)).json.pagination.total, 1);
  });

  await t.test('unauthenticated users cannot list responses', async () => {
    assert.equal((await listOf(anon, aliceRequest)).status, 401);
  });

  await t.test('invalid ids are rejected before querying', async () => {
    assert.equal((await alice.client.get('/api/requests/not-an-id/responses')).status, 400);
    assert.equal((await alice.client.get(`/api/requests/${aliceRequest.id}/responses/not-an-id/video`)).status, 400);
  });

  await t.test('pagination works and bad values are rejected', async () => {
    const page = await alice.client.get(`/api/requests/${aliceRequest.id}/responses?limit=1&page=2`);
    assert.equal(page.json.responses.length, 1);
    assert.equal(page.json.responses[0].clientName, 'Second');
    assert.equal((await alice.client.get(`/api/requests/${aliceRequest.id}/responses?limit=500`)).status, 400);
  });

  await t.test('an empty request returns an empty list', async () => {
    assert.deepEqual((await listOf(alice.client, emptyRequest)).json.responses, []);
  });

  await t.test('response counts are real in the request list, details and dashboard summary', async () => {
    const list = (await alice.client.get('/api/requests')).json.requests;
    assert.deepEqual(Object.fromEntries(list.map((r) => [r.title, r.responseCount])), { 'Alice request': 2, 'Alice empty': 0 });
    assert.equal((await alice.client.get(`/api/requests/${aliceRequest.id}`)).json.request.responseCount, 2);
    assert.equal((await alice.client.get('/api/requests/summary')).json.summary.totalResponses, 2);
    assert.equal((await bob.client.get('/api/requests/summary')).json.summary.totalResponses, 1);
    assert.equal((await admin.client.get('/api/requests/summary')).json.summary.totalResponses, 3);
  });

  await t.test('responses that are not submitted are not counted', async () => {
    await Response.create({ requestId: aliceRequest.id, status: 'pending_upload' });
    assert.equal((await alice.client.get(`/api/requests/${aliceRequest.id}`)).json.request.responseCount, 2);
    await Response.deleteMany({ status: 'pending_upload' });
  });
});
