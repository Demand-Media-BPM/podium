require('../helpers/setupS3Env'); // must be the first import: configuration is read once, when config/env.js loads
const { hasMongo } = require('../helpers/testServer');
const { setupS3, initiate, complete, uploadToS3, initiateBody } = require('../helpers/s3Setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Response } = require('../../models');
const { webmBytes } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';
const DAY_MS = 24 * 60 * 60 * 1000;

test('S3 submission: the happy path (integration, fake S3)', { skip }, async (t) => {
  const ctx = await setupS3(t);
  let flow;

  await t.test('initiate creates a PENDING response and returns only what this upload needs', async () => {
    const data = webmBytes(5000);
    const started = await initiate(ctx, initiateBody(data));
    assert.equal(started.status, 201);
    assert.deepEqual(Object.keys(started.json).sort(), ['alreadySubmitted', 'completionToken', 'responseId', 'success', 'upload']);
    assert.deepEqual(Object.keys(started.json.upload).sort(), ['expiresAt', 'fields', 'method', 'url']);
    assert.match(started.json.completionToken, /^[A-Za-z0-9_-]{43}$/);

    const doc = await Response.findById(started.json.responseId).select('+uploadKey +uploadTokenHash').lean();
    assert.equal(doc.status, 'pending_upload', 'not submitted before the upload is verified');
    assert.equal(doc.storageProvider, 's3');
    assert.equal(doc.clientEmail, 'carla@example.com');
    assert.equal(doc.consentAccepted, true);
    assert.equal(doc.fileSize, 5000);
    assert.equal(doc.submittedAt, undefined);
    assert.equal(doc.deleteAt, undefined);
    assert.match(doc.uploadKey, /^pending\/[0-9a-f]{24}\/[0-9a-f-]{36}\.webm$/);
    assert.equal(started.json.upload.fields.key, doc.uploadKey);

    // The credential is stored only as a hash; nothing secret or permanent is in MongoDB.
    assert.notEqual(doc.uploadTokenHash, started.json.completionToken);
    assert.equal(doc.uploadTokenHash.length, 64);
    assert.ok(!JSON.stringify(doc).includes(started.json.upload.fields.Policy), 'no presigned data is stored');
    assert.ok(!JSON.stringify(doc).includes('X-Amz-Signature'));
    flow = { started, data };
  });

  await t.test('the pending response is not visible to employees and not counted', async () => {
    const list = await ctx.client.get(`/api/requests/${ctx.requestId}/responses`);
    assert.deepEqual(list.json.responses, []);
    assert.equal((await ctx.client.get(`/api/requests/${ctx.requestId}`)).json.request.responseCount, 0);
  });

  await t.test('completing BEFORE the browser uploaded anything fails and leaves it pending', async () => {
    const res = await complete(ctx, flow.started.json.responseId, flow.started.json.completionToken);
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'UPLOAD_MISSING');
    assert.equal((await Response.findById(flow.started.json.responseId)).status, 'pending_upload');
  });

  await t.test('after the browser uploads to S3, completion verifies it and marks it submitted', async () => {
    const { upload, responseId, completionToken } = flow.started.json;
    assert.equal((await uploadToS3(upload, flow.data)).status, 204);
    assert.equal((await Response.findById(responseId)).status, 'pending_upload', 'uploading alone submits nothing');

    const done = await complete(ctx, responseId, completionToken);
    assert.equal(done.status, 200);
    assert.deepEqual(done.json, { success: true, duplicate: false, message: 'Your response has been submitted' });

    const doc = await Response.findById(responseId).select('+videoKey +uploadKey').lean();
    assert.equal(doc.status, 'submitted');
    assert.match(doc.videoKey, /^responses\/[0-9a-f]{24}\/[0-9a-f-]{36}\.webm$/);
    assert.equal(doc.uploadKey, undefined, 'the pending key is cleared');
    assert.ok(doc.submittedAt);
    assert.equal(doc.fileSize, 5000);
    assert.ok(ctx.s3.objects.has(doc.videoKey), 'the verified video is under responses/');
    assert.ok(!ctx.s3.keys().some((k) => k.startsWith('pending/')), 'the pending copy was removed');
  });

  await t.test('the retention deadline is the S3 object time + 60 days', async () => {
    const doc = await Response.findById(flow.started.json.responseId).select('+videoKey').lean();
    // S3 (and HTTP) report LastModified with whole-second precision, and the app uses what S3 reports.
    const objectTime = Math.floor(ctx.s3.objects.get(doc.videoKey).lastModified.getTime() / 1000) * 1000;
    assert.equal(doc.deleteAt.getTime(), objectTime + 60 * DAY_MS);
    assert.ok(Math.abs(doc.deleteAt - doc.submittedAt - 60 * DAY_MS) < 60_000, 'and so ~60 days after submission');
  });

  await t.test('the submitted response shows up for the employee, with no storage details', async () => {
    const list = await ctx.client.get(`/api/requests/${ctx.requestId}/responses`);
    assert.equal(list.json.responses.length, 1);
    const row = list.json.responses[0];
    assert.equal(row.effectiveStatus, 'submitted');
    assert.equal(row.playable, true);
    assert.equal(row.storageProvider, 's3');
    for (const secret of ['responses/', 'pending/', 'videoKey', 'uploadKey', 'uploadTokenHash', 'vrt-test-bucket']) {
      assert.ok(!list.text.includes(secret), `must not contain ${secret}`);
    }
    assert.equal((await ctx.client.get(`/api/requests/${ctx.requestId}`)).json.request.responseCount, 1);
  });
});
