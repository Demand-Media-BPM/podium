require('../helpers/setupS3Env');
const { hasMongo } = require('../helpers/testServer');
const { setupS3, submitVideo } = require('../helpers/s3Setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Response } = require('../../models');
const { runRetentionCleanup } = require('../../services/retentionService');
const { getS3Service } = require('../../services/s3Service');
const { webmBytes } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';
const DAY_MS = 24 * 60 * 60 * 1000;

test('180-day retention (integration, fake S3)', { skip }, async (t) => {
  const ctx = await setupS3(t);
  const s3 = () => getS3Service();
  const submit = async () => {
    const sent = await submitVideo(ctx, webmBytes(5000));
    return { id: sent.responseId, doc: await Response.findById(sent.responseId).select('+videoKey').lean() };
  };

  await t.test('the app refuses access at the deadline even though S3 still holds the object', async () => {
    const a = await submit();
    assert.equal((await ctx.client.get(`/api/responses/${a.id}/play`)).status, 200);
    await Response.updateOne({ _id: a.id }, { deleteAt: new Date(Date.now() - 1000) });
    for (const action of ['play', 'download']) {
      const res = await ctx.client.get(`/api/responses/${a.id}/${action}`);
      assert.equal(res.status, 410, action);
      assert.equal(res.json.code, 'VIDEO_EXPIRED');
      assert.match(res.json.message, /180-day/);
    }
    assert.ok(ctx.s3.objects.has(a.doc.videoKey), 'S3 has not removed it yet, but the app already refuses');
    const row = (await ctx.client.get(`/api/requests/${ctx.requestId}/responses`)).json.responses.find((r) => r.id === a.id);
    assert.equal(row.status, 'submitted', 'the stored status has not been updated yet');
    assert.equal(row.effectiveStatus, 'expired', 'but it is already shown as expired');
    assert.equal(row.playable, false);
  });

  await t.test('the job expires due records, deletes the object, clears the reference, keeps the history', async () => {
    const due = await submit();
    const notDue = await submit();
    await Response.updateOne({ _id: due.id }, { deleteAt: new Date(Date.now() - DAY_MS) });

    const result = await runRetentionCleanup({ s3: s3() });
    assert.equal(result.skipped, false);
    assert.ok(result.expired >= 1);

    const after = await Response.findById(due.id).select('+videoKey').lean();
    assert.equal(after.status, 'expired');
    assert.ok(after.expiredAt);
    assert.equal(after.videoKey, undefined, 'the storage reference is cleared');
    assert.equal(after.clientName, 'Carla Client', 'minimal history is kept');
    assert.equal(after.clientEmail, 'carla@example.com');
    assert.ok(after.submittedAt && after.deleteAt);
    assert.ok(!ctx.s3.objects.has(due.doc.videoKey), 'the S3 object was deleted right away');

    assert.equal((await Response.findById(notDue.id)).status, 'submitted', 'a record that is not due is untouched');
    assert.ok(ctx.s3.objects.has(notDue.doc.videoKey));
    assert.equal(await Response.countDocuments({ _id: due.id }), 1, 'the record itself is never deleted');
  });

  await t.test('the job is idempotent and tolerates an object that S3 already removed', async () => {
    const gone = await submit();
    ctx.s3.objects.delete(gone.doc.videoKey); // the lifecycle rule got there first
    await Response.updateOne({ _id: gone.id }, { deleteAt: new Date(Date.now() - 1000) });
    const first = await runRetentionCleanup({ s3: s3() });
    assert.ok(first.expired >= 1);
    const second = await runRetentionCleanup({ s3: s3() });
    assert.equal(second.expired, 0, 'a second run changes nothing');
    assert.equal((await Response.findById(gone.id)).status, 'expired');
  });

  await t.test('expired records are not playable and still count as received responses', async () => {
    const list = (await ctx.client.get(`/api/requests/${ctx.requestId}/responses`)).json.responses;
    const expired = list.filter((r) => r.status === 'expired');
    assert.ok(expired.length >= 1);
    assert.ok(expired.every((r) => r.playable === false && r.effectiveStatus === 'expired'));
    const summary = (await ctx.client.get('/api/requests/summary')).json.summary;
    assert.equal(summary.totalResponses, await Response.countDocuments({ status: { $in: ['submitted', 'expired'] } }));
  });

  await t.test('a job that cannot delete the object still expires the record (S3 lifecycle is the backstop)', async () => {
    const stuck = await submit();
    await Response.updateOne({ _id: stuck.id }, { deleteAt: new Date(Date.now() - 1000) });
    ctx.s3.failNext('DELETE', 3);
    const result = await runRetentionCleanup({ s3: s3() });
    assert.ok(result.objectsLeft >= 1);
    assert.equal((await Response.findById(stuck.id)).status, 'expired');
  });
});
