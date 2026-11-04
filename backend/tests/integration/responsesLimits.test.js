const { hasMongo } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Response } = require('../../models');
const config = require('../../config/env');
const { setup, submit, committedFiles, tempFiles, count } = require('../helpers/uploadSetup');
const { webmBytes, buildMultipart, PNG_BYTES } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';
const file = (data) => ({ name: 'r.webm', type: 'video/webm', data });

test('size limits (integration)', { skip }, async (t) => {
  await t.test('an upload larger than the limit is rejected with 413 and cleaned up', async (sub) => {
    const ctx = await setup(sub, { uploadMaxBytes: 64 * 1024 });
    // Just over the limit but inside the early Content-Length allowance, so the streaming limit is what stops it.
    const big = await submit(ctx, buildMultipart({ file: file(webmBytes(64 * 1024 + 1)) }));
    assert.equal(big.status, 413);
    assert.equal(big.json.code, 'VIDEO_TOO_LARGE');
    const exact = await submit(ctx, buildMultipart({ file: file(webmBytes(64 * 1024)) }));
    assert.equal(exact.status, 201, 'a file exactly at the limit is accepted');
    assert.equal(await count(), 1);
    assert.equal(committedFiles().length, 1);
    assert.deepEqual(tempFiles(), []);
  });

  await t.test('a body announced as far too large is refused before it is read', async (sub) => {
    const ctx = await setup(sub, { uploadMaxBytes: 64 * 1024 });
    const res = await submit(ctx, buildMultipart({ file: file(webmBytes(256 * 1024)) }));
    assert.equal(res.status, 413);
    assert.equal(await count(), 0);
    assert.deepEqual(tempFiles(), []);
  });

  await t.test('long recordings: 100 MiB is accepted under the new 2 GiB ceiling', async (sub) => {
    const ctx = await setup(sub);
    assert.equal(config.upload.maxBytes, 2 * 1024 * 1024 * 1024);

    const exact = await submit(ctx, buildMultipart({ file: file(webmBytes(104857600)) }));
    assert.equal(exact.status, 201);
    assert.equal((await Response.findOne({}).lean()).fileSize, 104857600);
    assert.deepEqual(tempFiles(), []);
  });
});

test('upload rate limiting (integration)', { skip }, async (t) => {
  const ctx = await setup(t, { uploadRateLimit: { limit: 3 } });
  const bad = () => submit(ctx, buildMultipart({ file: file(PNG_BYTES) }));
  for (let i = 0; i < 3; i += 1) assert.equal((await bad()).status, 415);
  const limited = await bad();
  assert.equal(limited.status, 429);
  assert.equal(limited.json.code, 'RATE_LIMITED');
  assert.equal(await count(), 0);
});
