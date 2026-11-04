const { hasMongo, postMultipart, tokenFromUrl } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Request } = require('../../models');
const { setup, submit, committedFiles, tempFiles, count } = require('../helpers/uploadSetup');
const { buildMultipart, VALID_FIELDS } = require('../helpers/videoFixtures');
const { Response } = require('../../models');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('retries are idempotent (integration)', { skip }, async (t) => {
  const ctx = await setup(t);
  const fields = VALID_FIELDS();

  await t.test('the same submission id never creates a second record or file', async () => {
    const first = await submit(ctx, buildMultipart({ fields }));
    assert.equal(first.status, 201);
    const second = await submit(ctx, buildMultipart({ fields }));
    assert.equal(second.status, 200);
    assert.equal(second.json.duplicate, true);
    assert.equal(await count(), 1);
    assert.equal(committedFiles().length, 1);
    assert.deepEqual(tempFiles(), []);
  });

  await t.test('simultaneous identical submissions still produce exactly one record and one file', async () => {
    const racing = VALID_FIELDS();
    const results = await Promise.all(Array.from({ length: 6 }, () => submit(ctx, buildMultipart({ fields: racing }))));
    assert.ok(results.every((res) => [200, 201].includes(res.status)), results.map((r) => r.status).join(','));
    assert.equal(results.filter((res) => res.status === 201).length, 1);
    assert.equal(await Response.countDocuments({ submissionId: racing.submissionId }), 1);
    assert.equal(committedFiles().length, 2, 'one file per distinct submission');
    assert.deepEqual(tempFiles(), []);
  });

  await t.test('a different submission id is a new response', async () => {
    assert.equal((await submit(ctx, buildMultipart({ fields: VALID_FIELDS() }))).status, 201);
    assert.equal(await count(), 3);
  });
});

test('closed, expired and invalid links refuse uploads (integration)', { skip }, async (t) => {
  const ctx = await setup(t);
  const expectUnavailable = async (label, token = ctx.token) => {
    const res = await postMultipart(ctx.baseUrl, `/api/public/${token}/responses`, buildMultipart({}));
    assert.equal(res.status, 404, label);
    assert.equal(res.json.code, 'LINK_UNAVAILABLE', label);
    return res.text;
  };

  await t.test('closed request looks exactly like an unknown link', async () => {
    await ctx.client.patch(`/api/requests/${ctx.requestId}`, { status: 'closed' });
    const closed = await expectUnavailable('closed');
    const unknown = await expectUnavailable('unknown', crypto.randomBytes(32).toString('base64url'));
    assert.equal(closed, unknown);
    await ctx.client.patch(`/api/requests/${ctx.requestId}`, { status: 'active' });
  });

  await t.test('expired request', async () => {
    await Request.updateOne({ _id: ctx.requestId }, { expiresAt: new Date(Date.now() - 60000) });
    await expectUnavailable('expired');
    await Request.updateOne({ _id: ctx.requestId }, { $unset: { expiresAt: 1 } });
  });

  await t.test('malformed tokens', async () => {
    for (const bad of ['abc', 'a'.repeat(43), '%00', '..%2F..%2Fetc', 'a'.repeat(3000)]) await expectUnavailable(bad, bad);
  });

  await t.test('an old link stops accepting uploads after the link is regenerated', async () => {
    const regenerated = (await ctx.client.post(`/api/requests/${ctx.requestId}/regenerate-link`, {})).json;
    await expectUnavailable('old token');
    const res = await postMultipart(ctx.baseUrl, `/api/public/${tokenFromUrl(regenerated.url)}/responses`, buildMultipart({}));
    assert.equal(res.status, 201);
  });

  await t.test('nothing was stored for any refused upload except the one valid submission', async () => {
    assert.equal(await count(), 1);
    assert.equal(committedFiles().length, 1);
    assert.deepEqual(tempFiles(), []);
  });
});
