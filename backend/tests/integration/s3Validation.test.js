require('../helpers/setupS3Env'); // must be the first import: configuration is read once, when config/env.js loads
const { hasMongo } = require('../helpers/testServer');
const { setupS3, initiate, complete, uploadToS3, submitVideo, initiateBody } = require('../helpers/s3Setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Response } = require('../../models');
const { webmBytes, mp4Bytes } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('S3 submission: media validation (integration, fake S3)', { skip }, async (t) => {
  const ctx = await setupS3(t);

  await t.test('an MP4 recording is accepted (codec parameters in the type are dropped)', async () => {
    const sent = await submitVideo(ctx, mp4Bytes(5000), { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2' });
    assert.equal(sent.done.status, 200);
    const doc = await Response.findById(sent.responseId).select('+videoKey').lean();
    assert.equal(doc.mimeType, 'video/mp4');
    assert.ok(doc.videoKey.endsWith('.mp4'));
  });

  await t.test('a file that is not a video is rejected at completion and can never become submitted', async () => {
    const fake = Buffer.concat([Buffer.from('<html><script>alert(1)</script>'), Buffer.alloc(5000)]);
    const started = (await initiate(ctx, initiateBody(fake))).json;
    assert.equal((await uploadToS3(started.upload, fake)).status, 204, 'S3 itself only checks size and type, not content');
    const done = await complete(ctx, started.responseId, started.completionToken);
    assert.equal(done.status, 415);
    assert.equal(done.json.code, 'UNSUPPORTED_VIDEO');
    const doc = await Response.findById(started.responseId).lean();
    assert.equal(doc.status, 'failed');
    assert.equal(doc.failureReason, 'unsupported_video');
    assert.equal(ctx.s3.keys().filter((k) => k.startsWith('pending/')).length, 0, 'the bad object was deleted');
    // ...and it stays failed: completing again cannot resurrect it.
    assert.equal((await complete(ctx, started.responseId, started.completionToken)).status, 409);
    assert.equal((await Response.findById(started.responseId)).status, 'failed');
  });

  await t.test('an MP4 uploaded while declared as WebM is rejected (declared type must match the bytes)', async () => {
    const data = mp4Bytes(5000);
    const started = (await initiate(ctx, initiateBody(data, { mimeType: 'video/webm' }))).json;
    await uploadToS3(started.upload, data);
    assert.equal((await complete(ctx, started.responseId, started.completionToken)).status, 415);
  });

  await t.test('initiate validates every field and refuses unsafe input without creating anything', async () => {
    const before = await Response.countDocuments({});
    const good = webmBytes(5000);
    const cases = {
      'no consent': { consentAccepted: false },
      'consent as a string': { consentAccepted: 'true' },
      'bad email': { clientEmail: 'nope' },
      'empty name': { clientName: '' },
      'long name': { clientName: 'x'.repeat(101) },
      'not a uuid': { submissionId: 'abc' },
      'unsupported type': { mimeType: 'video/x-msvideo' },
      'html type': { mimeType: 'text/html' },
      'zero size': { fileSize: 0 },
      'tiny size': { fileSize: 10 },
      'negative size': { fileSize: -5 },
      'fractional size': { fileSize: 5000.5 },
      'size as a string': { fileSize: '5000' },
      'too long': { durationSeconds: 500 },
      'zero duration': { durationSeconds: 0 },
    };
    for (const [label, override] of Object.entries(cases)) {
      const res = await initiate(ctx, initiateBody(good, override));
      assert.equal(res.status, 400, label);
      assert.equal(res.json.code, 'VALIDATION_ERROR', label);
    }
    for (const extra of [{ status: 'submitted' }, { videoKey: 'x' }, { requestId: 'a'.repeat(24) }, { uploadKey: 'pending/x' }, { storageProvider: 'local' }]) {
      assert.equal((await initiate(ctx, { ...initiateBody(good), ...extra })).status, 400, JSON.stringify(extra));
    }
    assert.equal((await ctx.post(`/api/public/${ctx.token}/uploads`, [1, 2])).status, 400);
    assert.equal(await Response.countDocuments({}), before, 'nothing was stored');
  });

  await t.test('an oversized recording is refused at initiate with 413, so no upload is ever authorized', async () => {
    const res = await initiate(ctx, initiateBody(webmBytes(5000), { fileSize: 2147483649 }));
    assert.equal(res.status, 413);
    assert.equal(res.json.code, 'VIDEO_TOO_LARGE');
    const exactly = await initiate(ctx, initiateBody(webmBytes(5000), { fileSize: 2147483648 }));
    assert.equal(exactly.status, 201, 'exactly 2 GiB is allowed');
    const policy = JSON.parse(Buffer.from(exactly.json.upload.fields.Policy, 'base64').toString());
    assert.deepEqual(policy.conditions.find((c) => c[0] === 'content-length-range'), ['content-length-range', 2147483648, 2147483648]);
  });

  await t.test('uploading a different size than declared is refused by S3 itself', async () => {
    const data = webmBytes(5000);
    const started = (await initiate(ctx, initiateBody(data))).json;
    const tooBig = await uploadToS3(started.upload, webmBytes(6000));
    assert.ok(tooBig.status >= 400);
    assert.ok(!ctx.s3.keys().includes(started.upload.fields.key), 'nothing was stored');
    assert.equal((await complete(ctx, started.responseId, started.completionToken)).status, 409);
  });

  await t.test('the credential-less and bad-token variants of initiate never reach the database', async () => {
    assert.equal((await ctx.post(`/api/public/${crypto.randomBytes(32).toString('base64url')}/uploads`, initiateBody(webmBytes(5000)))).status, 404);
    assert.equal((await ctx.post('/api/public/short/uploads', initiateBody(webmBytes(5000)))).status, 404);
  });
});
