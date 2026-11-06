const { hasMongo } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { Response } = require('../../models');
const videoStore = require('../../services/videoStore');
const { setup, submit, committedFiles, tempFiles } = require('../helpers/uploadSetup');
const { webmBytes, mp4Bytes, buildMultipart, VALID_FIELDS } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';
const DAY_MS = 24 * 60 * 60 * 1000;

test('public response submission: success paths (integration)', { skip }, async (t) => {
  const ctx = await setup(t);

  await t.test('stores a WebM, creates the record, and returns no file details', async () => {
    const fields = VALID_FIELDS();
    const res = await submit(ctx, buildMultipart({ fields }));
    assert.equal(res.status, 201);
    assert.deepEqual(res.json, { success: true, duplicate: false, message: 'Your response has been submitted' });

    const doc = await Response.findOne({ submissionId: fields.submissionId }).select('+videoKey').lean();
    assert.equal(String(doc.requestId), ctx.requestId);
    assert.equal(doc.clientName, 'Carla Client');
    assert.equal(doc.clientEmail, 'carla@example.com');
    assert.equal(doc.consentAccepted, true);
    assert.equal(doc.status, 'submitted');
    assert.equal(doc.storageProvider, 'local');
    assert.equal(doc.mimeType, 'video/webm');
    assert.equal(doc.fileSize, webmBytes().length);
    assert.equal(doc.durationSeconds, 42.5);
    assert.match(doc.videoKey, /^[0-9a-f]{24}\/[0-9a-f-]{36}\.webm$/);
    assert.ok(doc.submittedAt && doc.createdAt);

    // The key and any filesystem path stay server-side.
    for (const secret of [doc.videoKey, videoStore.rootDir, 'videoKey', '.webm']) {
      assert.ok(!res.text.includes(secret), `response must not contain ${secret}`);
    }
    assert.deepEqual(fs.readFileSync(videoStore.resolveKey(doc.videoKey)), webmBytes());
    assert.deepEqual(tempFiles(), [], 'no temp file is left behind');
  });

  await t.test('deleteAt is 60 days after submission and there is no automatic deletion', async () => {
    const doc = await Response.findOne({}).lean();
    const days = (doc.deleteAt - doc.submittedAt) / DAY_MS;
    assert.ok(Math.abs(days - 60) < 0.001, `deleteAt is ${days} days after submittedAt`);
    const indexes = await Response.collection.indexes();
    assert.ok(!indexes.some((index) => index.expireAfterSeconds !== undefined), 'no TTL index');
  });

  await t.test('stores an MP4 (Safari/iOS) with an mp4 extension', async () => {
    const res = await submit(ctx, buildMultipart({ file: { name: 'r.mp4', type: 'video/mp4', data: mp4Bytes() } }));
    assert.equal(res.status, 201);
    const doc = await Response.findOne({ mimeType: 'video/mp4' }).select('+videoKey').lean();
    assert.ok(doc.videoKey.endsWith('.mp4'));
  });

  await t.test('the stored type comes from the file bytes, not from what the client claims', async () => {
    const res = await submit(ctx, buildMultipart({ file: { name: 'x.webm', type: 'video/webm', data: mp4Bytes() } }));
    assert.equal(res.status, 201);
    assert.equal(await Response.countDocuments({ mimeType: 'video/mp4' }), 2, 'an MP4 declared as WebM is stored as MP4');
  });

  await t.test('client-controlled file names are ignored (no traversal, no reuse)', async () => {
    const before = committedFiles().length;
    const evil = ['../../evil.webm', '..\\..\\evil.webm', '/etc/passwd', 'C:\\Windows\\evil.webm', '<script>.webm'];
    for (const name of evil) {
      const res = await submit(ctx, buildMultipart({ file: { name, type: 'video/webm', data: webmBytes() } }));
      assert.equal(res.status, 201, name);
    }
    const files = committedFiles();
    assert.equal(files.length, before + evil.length);
    for (const file of files) {
      assert.match(file.replace(/\\/g, '/').split('/').slice(-2).join('/'), /^[0-9a-f]{24}\/[0-9a-f-]{36}\.(webm|mp4)$/);
    }
  });

  await t.test('a NUL byte in the file name is a malformed upload and is refused', async () => {
    const before = committedFiles().length;
    const res = await submit(ctx, buildMultipart({ file: { name: 'a\u0000b.webm', type: 'video/webm', data: webmBytes() } }));
    assert.equal(res.status, 400);
    assert.equal(committedFiles().length, before);
    assert.deepEqual(tempFiles(), []);
  });
});
