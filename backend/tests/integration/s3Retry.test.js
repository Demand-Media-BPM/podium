require('../helpers/setupS3Env');
const { hasMongo } = require('../helpers/testServer');
const { setupS3, initiate, complete, uploadToS3, initiateBody } = require('../helpers/s3Setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Response } = require('../../models');
const { webmBytes } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';
const data = webmBytes(5000);
const count = () => Response.countDocuments({});

test('S3 retries and duplicates (integration, fake S3)', { skip }, async (t) => {
  const ctx = await setupS3(t);

  await t.test('an interrupted upload can be retried: same submission id, same record, fresh authorization', async () => {
    const body = initiateBody(data);
    const first = (await initiate(ctx, body)).json;
    // The first attempt dies before anything reaches S3. The browser asks again with the same submission id.
    const second = (await initiate(ctx, body)).json;
    assert.equal(second.responseId, first.responseId, 'the same record is reused');
    assert.notEqual(second.completionToken, first.completionToken, 'the credential is rotated');
    assert.notEqual(second.upload.fields.key, first.upload.fields.key, 'a fresh object key is issued');
    assert.equal(await count(), 1);

    // The old credential no longer works, the new one does.
    await uploadToS3(second.upload, data);
    assert.equal((await complete(ctx, first.responseId, first.completionToken)).status, 404);
    assert.equal((await complete(ctx, second.responseId, second.completionToken)).status, 200);
    assert.equal(await count(), 1, 'still exactly one response');
  });

  await t.test('a retry after a completed submission reports it as already submitted (no new record, no upload)', async () => {
    const body = initiateBody(data);
    const a = (await initiate(ctx, body)).json;
    await uploadToS3(a.upload, data);
    assert.equal((await complete(ctx, a.responseId, a.completionToken)).status, 200);
    const before = await count();
    const again = await initiate(ctx, body);
    assert.equal(again.status, 200);
    assert.deepEqual(again.json, { success: true, alreadySubmitted: true });
    assert.equal(await count(), before);
  });

  await t.test('an object uploaded to a replaced authorization is cleaned up', async () => {
    const body = initiateBody(data);
    const a = (await initiate(ctx, body)).json;
    await uploadToS3(a.upload, data);
    assert.ok(ctx.s3.keys().includes(a.upload.fields.key));
    await initiate(ctx, body); // the browser retried instead of completing
    assert.ok(!ctx.s3.keys().includes(a.upload.fields.key), 'the orphaned first object was removed');
  });

  await t.test('simultaneous identical initiates produce exactly one record', async () => {
    const body = initiateBody(data);
    const before = await count();
    const results = await Promise.all(Array.from({ length: 6 }, () => initiate(ctx, body)));
    assert.ok(results.every((r) => r.status === 201), results.map((r) => r.status).join());
    assert.equal(new Set(results.map((r) => r.json.responseId)).size, 1);
    assert.equal(await count(), before + 1);
  });

  await t.test('simultaneous completions of one upload submit it once and keep one video', async () => {
    const a = (await initiate(ctx, initiateBody(data))).json;
    await uploadToS3(a.upload, data);
    const results = await Promise.all(Array.from({ length: 6 }, () => complete(ctx, a.responseId, a.completionToken)));
    assert.ok(results.every((r) => r.status === 200), results.map((r) => r.status).join());
    assert.equal(results.filter((r) => r.json.duplicate === false).length, 1, 'exactly one completion did the work');
    const doc = await Response.findById(a.responseId).select('+videoKey').lean();
    assert.equal(doc.status, 'submitted');
    assert.ok(ctx.s3.objects.has(doc.videoKey), 'the submitted video exists');
    const uuid = a.upload.fields.key.split('/')[2];
    assert.equal(ctx.s3.keys().filter((k) => k.includes(uuid)).length, 1, 'only the final copy of that video remains');
  });
});
