require('../helpers/setupS3Env');
const { hasMongo } = require('../helpers/testServer');
const { setupS3 } = require('../helpers/s3Setup');
const { legacyRecord } = require('../helpers/legacyRecord');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const { Response } = require('../../models');
const videoStore = require('../../services/videoStore');
const { getS3Service } = require('../../services/s3Service');
const { listLocalVideos, migrateOne, cleanupMigrated } = require('../../services/localMigration');
const { webmBytes } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('migrating Phase 4 local test recordings to S3 (integration, fake S3)', { skip }, async (t) => {
  const ctx = await setupS3(t);
  t.after(() => fs.rmSync(videoStore.rootDir, { recursive: true, force: true }));
  const s3 = () => getS3Service();
  const itemFor = async (record) => (await listLocalVideos()).find((i) => String(i.doc._id) === String(record.id));
  const good = await legacyRecord(ctx.requestId, webmBytes(5000));
  const notVideo = await legacyRecord(ctx.requestId, Buffer.alloc(5000, 0x41));
  const missing = await legacyRecord(ctx.requestId, webmBytes(5000));
  fs.rmSync(videoStore.resolveKey(missing.key));

  await t.test('old records are found through the legacy field, and the report changes nothing', async () => {
    const items = await listLocalVideos();
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((i) => i.present), [true, true, false]);
    assert.equal(ctx.s3.keys().length, 0, 'listing never touches S3');
    assert.equal((await Response.findById(good.id)).storage, 'local');
  });

  await t.test('old records show as local test files and are not playable in S3 mode', async () => {
    const list = (await ctx.client.get(`/api/requests/${ctx.requestId}/responses`)).json.responses;
    assert.ok(list.every((r) => r.storageProvider === 'local'));
    const res = await ctx.client.get(`/api/responses/${good.id}/play`);
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'LOCAL_VIDEO_UNAVAILABLE');
  });

  await t.test('migration copies a good file, verifies it, then repoints the record; the local file stays', async () => {
    const result = await migrateOne(await itemFor(good), s3());
    assert.equal(result.migrated, true);
    const doc = await Response.findById(good.id).select('+videoKey +migratedFromLocalKey').lean();
    assert.equal(doc.storageProvider, 's3');
    assert.match(doc.videoKey, /^responses\/[0-9a-f]{24}\/[0-9a-f-]{36}\.webm$/);
    assert.equal(doc.migratedFromLocalKey, good.key);
    assert.ok(fs.existsSync(videoStore.resolveKey(good.key)), 'the local file is kept');
    const object = ctx.s3.objects.get(doc.videoKey);
    assert.equal(object.encryption, 'AES256');
    assert.equal(doc.deleteAt.getTime(), Math.floor(object.lastModified.getTime() / 1000) * 1000 + 180 * 86400000, 'fresh 180 days');
  });

  await t.test('the migrated video can now be played through a signed URL', async () => {
    const res = await ctx.client.get(`/api/responses/${good.id}/play`);
    assert.equal(res.status, 200);
    assert.deepEqual(Buffer.from(await (await fetch(res.json.url)).arrayBuffer()), webmBytes(5000));
  });

  await t.test('files that are not videos or are missing are skipped, and their records are untouched', async () => {
    for (const [record, reason] of [[notVideo, 'unsupported_format'], [missing, 'file_missing']]) {
      assert.deepEqual(await migrateOne(await itemFor(record), s3()), { migrated: false, reason });
      assert.equal((await Response.findById(record.id)).storage, 'local');
    }
    assert.equal(ctx.s3.keys().length, 1, 'only the good video was uploaded');
  });

  await t.test('cleanup removes a local copy only when the S3 copy still verifies', async () => {
    const doc = await Response.findById(good.id).select('+videoKey');
    ctx.s3.objects.delete(doc.videoKey); // the S3 copy vanished
    assert.deepEqual(await cleanupMigrated(s3()), { deleted: 0, skipped: 1 });
    assert.ok(fs.existsSync(videoStore.resolveKey(good.key)), 'the local file is kept when S3 cannot confirm');

    ctx.s3.put(doc.videoKey, webmBytes(5000), { contentType: 'video/webm' }); // restored
    assert.deepEqual(await cleanupMigrated(s3()), { deleted: 1, skipped: 0 });
    assert.equal(fs.existsSync(videoStore.resolveKey(good.key)), false);
  });

  await t.test('a record that changed after it was listed is not repointed', async () => {
    const racing = await legacyRecord(ctx.requestId, webmBytes(5000));
    const item = await itemFor(racing);
    await Response.collection.updateOne({ _id: racing.id }, { $set: { videoKey: `${ctx.requestId}/${crypto.randomUUID()}.webm` } });
    assert.deepEqual(await migrateOne(item, s3()), { migrated: false, reason: 'record_changed' });
    const goodKey = (await Response.findById(good.id).select('+videoKey')).videoKey;
    const others = ctx.s3.keys().filter((k) => k.startsWith('responses/') && k !== goodKey);
    assert.deepEqual(others, [], 'the copied object was removed again');
  });
});
