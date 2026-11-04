require('../helpers/setupS3Env');
const { hasMongo } = require('../helpers/testServer');
const { setupS3, initiate, initiateBody, uploadToS3 } = require('../helpers/s3Setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Response, JobLock } = require('../../models');
const { runRetentionCleanup, startRetentionSchedule } = require('../../services/retentionService');
const { getS3Service } = require('../../services/s3Service');
const { acquireLock, releaseLock } = require('../../services/jobLock');
const { webmBytes } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';
const data = webmBytes(5000);

test('abandoned uploads, locking and scheduling (integration, fake S3)', { skip }, async (t) => {
  const ctx = await setupS3(t);

  await t.test('abandoned uploads are marked failed and their objects removed; recent ones are left alone', async () => {
    const started = (await initiate(ctx, initiateBody(data))).json;
    await uploadToS3(started.upload, data); // uploaded but never completed
    // createdAt is immutable in Mongoose, so backdate it through the raw collection (as a really old record would be).
    await Response.collection.updateOne(
      { _id: new (require('mongoose').Types.ObjectId)(started.responseId) },
      { $set: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } }
    );
    const recent = (await initiate(ctx, initiateBody(data))).json;

    const result = await runRetentionCleanup({ s3: getS3Service() });
    assert.ok(result.abandoned >= 1);
    const doc = await Response.findById(started.responseId).select('+uploadTokenHash').lean();
    assert.equal(doc.status, 'failed');
    assert.equal(doc.failureReason, 'abandoned');
    assert.equal(doc.uploadTokenHash, undefined, 'the credential is cleared');
    assert.ok(!ctx.s3.keys().includes(started.upload.fields.key));
    assert.equal((await Response.findById(recent.responseId)).status, 'pending_upload');
  });

  await t.test('only one instance runs the job at a time (MongoDB lock)', async () => {
    assert.equal(await acquireLock('test-lock', 60_000), true);
    await JobLock.updateOne({ _id: 'test-lock' }, { owner: 'another-instance' }); // now held by someone else
    assert.equal(await acquireLock('test-lock', 60_000), false);
    await JobLock.updateOne({ _id: 'test-lock' }, { lockedUntil: new Date(Date.now() - 1000) }); // lease ran out
    assert.equal(await acquireLock('test-lock', 60_000), true, 'an expired lease can be taken over (crashed instance)');
    await releaseLock('test-lock');
    assert.equal(await acquireLock('test-lock', 60_000), true);
  });

  await t.test('a run is skipped while another instance holds the job lock', async () => {
    await JobLock.updateOne(
      { _id: 'retention-cleanup' },
      { $set: { lockedUntil: new Date(Date.now() + 60_000), owner: 'another-instance' } },
      { upsert: true }
    );
    assert.deepEqual(await runRetentionCleanup({ s3: getS3Service() }), { skipped: true, reason: 'locked' });
    await JobLock.deleteOne({ _id: 'retention-cleanup' });
  });

  await t.test('the lock is released after a run so the next run is not delayed', async () => {
    assert.equal((await runRetentionCleanup({ s3: getS3Service() })).skipped, false);
    assert.equal((await runRetentionCleanup({ s3: getS3Service() })).skipped, false);
  });

  await t.test('the in-process schedule can be switched off, and its errors never escape or log client data', async () => {
    startRetentionSchedule({ settings: { jobEnabled: false } }).stop();
    const errors = [];
    const original = console.error;
    console.error = (m) => errors.push(String(m));
    try {
      const schedule = startRetentionSchedule({
        settings: { jobEnabled: true, intervalMs: 1e9, initialDelayMs: 1e9 },
        run: async () => {
          throw new Error('client@example.com exploded');
        },
      });
      await schedule.tick();
      schedule.stop();
    } finally {
      console.error = original;
    }
    assert.ok(errors.some((e) => /Retention job failed/.test(e)));
    assert.ok(!errors.join(' ').includes('client@example.com'));
  });

  await t.test('there is no TTL index: MongoDB never deletes response records by itself', async () => {
    const indexes = await Response.collection.indexes();
    assert.ok(!indexes.some((i) => i.expireAfterSeconds !== undefined));
  });
});
