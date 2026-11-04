require('../helpers/setupS3Env');
const { hasMongo } = require('../helpers/testServer');
const { setupS3, initiate, complete, uploadToS3, initiateBody } = require('../helpers/s3Setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Request, Response } = require('../../models');
const { getS3Service } = require('../../services/s3Service');
const { webmBytes } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';
const data = webmBytes(5000);
const count = () => Response.countDocuments({});

test('S3 submission against closed, expired and tampered state (integration, fake S3)', { skip }, async (t) => {
  const ctx = await setupS3(t);

  await t.test('an object swapped between verification and promotion is not promoted', async () => {
    const a = (await initiate(ctx, initiateBody(data))).json;
    await uploadToS3(a.upload, data);
    const original = ctx.s3.objects.get(a.upload.fields.key);
    // Right after verification reads the first bytes, someone replaces the object (same size, different content).
    const service = getS3Service();
    const readStart = service.readStart;
    service.readStart = async (...args) => {
      const out = await readStart(...args);
      const swapped = Buffer.concat([webmBytes(5000).subarray(0, 40), Buffer.alloc(4960, 0x7a)]);
      ctx.s3.put(a.upload.fields.key, swapped, { contentType: 'video/webm', metadata: original.metadata });
      return out;
    };
    try {
      const res = await complete(ctx, a.responseId, a.completionToken);
      assert.equal(res.status, 409);
      assert.equal(res.json.code, 'UPLOAD_INVALID');
    } finally {
      service.readStart = readStart;
    }
    assert.equal((await Response.findById(a.responseId)).status, 'failed');
    assert.ok(!ctx.s3.keys().some((k) => k.startsWith('responses/')), 'nothing was promoted');
  });

  await t.test('a request closed after initiate refuses completion; the response never becomes submitted', async () => {
    const a = (await initiate(ctx, initiateBody(data))).json;
    await uploadToS3(a.upload, data);
    await ctx.client.patch(`/api/requests/${ctx.requestId}`, { status: 'closed' });
    const res = await complete(ctx, a.responseId, a.completionToken);
    assert.equal(res.status, 404);
    assert.equal(res.json.code, 'LINK_UNAVAILABLE');
    assert.equal((await Response.findById(a.responseId)).status, 'pending_upload');
    await ctx.client.patch(`/api/requests/${ctx.requestId}`, { status: 'active' });
  });

  await t.test('closed, expired and unknown links refuse to initiate, and nothing is created', async () => {
    const before = await count();
    await ctx.client.patch(`/api/requests/${ctx.requestId}`, { status: 'closed' });
    assert.equal((await initiate(ctx, initiateBody(data))).status, 404);
    await ctx.client.patch(`/api/requests/${ctx.requestId}`, { status: 'active' });

    await Request.updateOne({ _id: ctx.requestId }, { expiresAt: new Date(Date.now() - 60000) });
    const expired = await initiate(ctx, initiateBody(data));
    assert.equal(expired.status, 404);
    assert.equal(expired.json.code, 'LINK_UNAVAILABLE');
    await Request.updateOne({ _id: ctx.requestId }, { $unset: { expiresAt: 1 } });

    assert.equal((await ctx.post(`/api/public/${crypto.randomBytes(32).toString('base64url')}/uploads`, initiateBody(data))).status, 404);
    assert.equal(await count(), before);
  });

  await t.test('after the link is regenerated the old link cannot initiate or complete', async () => {
    const a = (await initiate(ctx, initiateBody(data))).json;
    await uploadToS3(a.upload, data);
    await ctx.client.post(`/api/requests/${ctx.requestId}/regenerate-link`, {});
    assert.equal((await initiate(ctx, initiateBody(data))).status, 404);
    assert.equal((await complete(ctx, a.responseId, a.completionToken)).status, 404);
    assert.equal((await Response.findById(a.responseId)).status, 'pending_upload');
  });

  await t.test('a pending upload older than 24 hours can no longer be completed', async () => {
    const fresh = await ctx.client.post('/api/requests', { title: 'Old', question: 'Q?' });
    const token = fresh.json.url.split('/').pop();
    const post = (path, body) => ctx.anon.post(`/api/public/${token}${path}`, body);
    const a = (await post('/uploads', initiateBody(data))).json;
    await uploadToS3(a.upload, data);
    await Response.updateOne({ _id: a.responseId }, { uploadIssuedAt: new Date(Date.now() - 25 * 3600 * 1000) });
    const res = await post(`/uploads/${a.responseId}/complete`, { completionToken: a.completionToken });
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'SUBMISSION_CLOSED');
  });
});
