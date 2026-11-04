require('../helpers/setupS3Env');
const { hasMongo, createClient, loginAs, tokenFromUrl } = require('../helpers/testServer');
const { setupS3, initiate, complete, uploadToS3, initiateBody } = require('../helpers/s3Setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Response } = require('../../models');
const { webmBytes } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';
const data = webmBytes(5000);

test('S3 completion authorization (integration, fake S3)', { skip }, async (t) => {
  const ctx = await setupS3(t);
  // A second request with its own public link, owned by someone else.
  const other = await loginAs(ctx.baseUrl, { email: 'olga@example.com', name: 'Olga' });
  const otherRequest = (await other.client.post('/api/requests', { title: 'Other', question: 'Q?' })).json;
  const otherToken = tokenFromUrl(otherRequest.url);
  const anon = createClient(ctx.baseUrl);

  const started = (await initiate(ctx, initiateBody(data))).json;
  await uploadToS3(started.upload, data);
  const goodPath = `/api/public/${ctx.token}/uploads/${started.responseId}/complete`;
  const stateOf = async () => (await Response.findById(started.responseId)).status;

  await t.test('a response id alone is never enough: no credential, wrong credential, malformed credential', async () => {
    const wrong = [undefined, '', 'x', crypto.randomBytes(32).toString('base64url'), started.completionToken.slice(1), started.completionToken + 'a', 12345, { $ne: 1 }, [started.completionToken]];
    const bodies = new Set();
    for (const credential of wrong) {
      const res = await anon.post(goodPath, { completionToken: credential });
      assert.equal(res.status, 404, JSON.stringify(credential));
      bodies.add(res.text);
    }
    assert.equal(bodies.size, 1, 'every failure looks identical');
    assert.equal((await anon.post(goodPath, {})).status, 404);
    assert.equal((await anon.post(goodPath, undefined)).status, 404);
    assert.equal(await stateOf(), 'pending_upload', 'nothing was completed');
  });

  await t.test("another client's link cannot complete this submission, even with the right credential", async () => {
    const path = `/api/public/${otherToken}/uploads/${started.responseId}/complete`;
    const res = await anon.post(path, { completionToken: started.completionToken });
    assert.equal(res.status, 404);
    assert.equal(await stateOf(), 'pending_upload');
  });

  await t.test('unknown links, malformed ids and ids of other requests are all the same 404/400', async () => {
    const fakeToken = crypto.randomBytes(32).toString('base64url');
    assert.equal((await anon.post(`/api/public/${fakeToken}/uploads/${started.responseId}/complete`, { completionToken: started.completionToken })).status, 404);
    assert.equal((await anon.post(`/api/public/${ctx.token}/uploads/not-an-id/complete`, { completionToken: started.completionToken })).status, 400);
    assert.equal((await anon.post(`/api/public/${ctx.token}/uploads/${'0'.repeat(24)}/complete`, { completionToken: started.completionToken })).status, 404);
  });

  await t.test('an employee session cookie is not an authorization for completion either', async () => {
    const res = await ctx.client.post(goodPath, { completionToken: 'x'.repeat(43) });
    assert.equal(res.status, 404);
  });

  await t.test('only the origin-trusted browser app may call the endpoints (CSRF origin check)', async () => {
    assert.equal((await anon.post(goodPath, { completionToken: started.completionToken }, { origin: 'https://evil.example.com' })).status, 403);
    assert.equal((await anon.post(`/api/public/${ctx.token}/uploads`, initiateBody(data), { origin: null })).status, 403);
    assert.equal(await stateOf(), 'pending_upload');
  });

  await t.test('the right link + id + credential completes it; completing again is idempotent', async () => {
    const first = await anon.post(goodPath, { completionToken: started.completionToken });
    assert.equal(first.status, 200);
    assert.equal(first.json.duplicate, false);
    const second = await anon.post(goodPath, { completionToken: started.completionToken });
    assert.equal(second.status, 200);
    assert.equal(second.json.duplicate, true);
    assert.equal(await Response.countDocuments({ status: 'submitted' }), 1);
    // The repeat still needs the credential.
    assert.equal((await anon.post(goodPath, { completionToken: 'y'.repeat(43) })).status, 404);
  });

  await t.test('the completion token is never returned again and never stored in clear', async () => {
    const doc = await Response.findById(started.responseId).select('+uploadTokenHash').lean();
    assert.notEqual(doc.uploadTokenHash, started.completionToken);
    const list = await ctx.client.get(`/api/requests/${ctx.requestId}/responses`);
    assert.ok(!list.text.includes(started.completionToken));
    assert.ok(!list.text.includes(doc.uploadTokenHash));
  });
});
