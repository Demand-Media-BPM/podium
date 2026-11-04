const { hasMongo } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, submit, committedFiles, tempFiles, count } = require('../helpers/uploadSetup');
const { webmBytes, buildMultipart, VALID_FIELDS, PNG_BYTES, PDF_BYTES, EXE_BYTES, TEXT_BYTES } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('public response submission: rejected uploads (integration)', { skip }, async (t) => {
  const ctx = await setup(t);
  const video = (data) => ({ name: 'recording.webm', type: 'video/webm', data });

  await t.test('rejects files that are not videos, even when named and typed like videos', async () => {
    for (const [label, data] of [['png', PNG_BYTES], ['pdf', PDF_BYTES], ['exe', EXE_BYTES], ['html', TEXT_BYTES], ['zeros', Buffer.alloc(8192)]]) {
      const res = await submit(ctx, buildMultipart({ file: video(data) }));
      assert.equal(res.status, 415, label);
      assert.equal(res.json.code, 'UNSUPPORTED_VIDEO', label);
    }
    assert.equal(await count(), 0);
    assert.deepEqual(committedFiles(), [], 'nothing was stored');
    assert.deepEqual(tempFiles(), [], 'rejected uploads are removed');
  });

  await t.test('rejects empty and tiny recordings', async () => {
    for (const data of [Buffer.alloc(0), webmBytes(100)]) {
      assert.equal((await submit(ctx, buildMultipart({ file: video(data) }))).status, 400);
    }
    assert.deepEqual(tempFiles(), []);
  });

  await t.test('rejects a missing video, a file in the wrong field, and several files', async () => {
    const none = await submit(ctx, buildMultipart({ file: null }));
    assert.equal(none.status, 400);
    assert.equal(none.json.code, 'VIDEO_REQUIRED');

    assert.equal((await submit(ctx, buildMultipart({ fileField: 'file' }))).status, 400);

    const one = buildMultipart({});
    const boundary = one.contentType.split('boundary=')[1];
    const body = Buffer.concat([
      one.body.subarray(0, one.body.length - `--${boundary}--\r\n`.length),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="b.webm"\r\nContent-Type: video/webm\r\n\r\n`),
      webmBytes(),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    assert.equal((await submit(ctx, { body, contentType: one.contentType })).status, 400);
    assert.equal(await count(), 0);
    assert.deepEqual(tempFiles(), []);
  });

  await t.test('validates the client fields on the server and stores nothing on failure', async () => {
    const cases = {
      clientName: { clientName: '' },
      clientNameTooLong: { clientName: 'x'.repeat(101) },
      clientEmail: { clientEmail: 'not-an-email' },
      clientEmailTooLong: { clientEmail: `${'a'.repeat(250)}@b.co` },
      consentMissing: { consentAccepted: undefined },
      consentFalse: { consentAccepted: 'false' },
      duration: { durationSeconds: '500' },
      durationZero: { durationSeconds: '0' },
      submissionId: { submissionId: 'abc' },
    };
    for (const [label, override] of Object.entries(cases)) {
      const fields = { ...VALID_FIELDS(), ...override };
      for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key];
      const res = await submit(ctx, buildMultipart({ fields }));
      assert.equal(res.status, 400, label);
      assert.equal(res.json.code, 'VALIDATION_ERROR', label);
      assert.ok(res.json.details, label);
    }
    assert.equal(await count(), 0);
    assert.deepEqual(committedFiles(), []);
    assert.deepEqual(tempFiles(), []);
  });

  await t.test('rejects unexpected fields instead of letting clients set stored values', async () => {
    for (const extra of [{ status: 'failed' }, { requestId: 'a'.repeat(24) }, { videoKey: '../x' }, { deleteAt: '2000-01-01' }]) {
      const res = await submit(ctx, buildMultipart({ fields: { ...VALID_FIELDS(), ...extra } }));
      assert.equal(res.status, 400, JSON.stringify(extra));
    }
    assert.equal(await count(), 0);
  });

  await t.test('requires multipart/form-data', async () => {
    const res = await ctx.client.post(`/api/public/${ctx.token}/responses`, VALID_FIELDS());
    assert.equal(res.status, 415);
  });

  await t.test('rejects a truncated multipart body without leaving files behind', async () => {
    const { body, contentType } = buildMultipart({});
    const res = await submit(ctx, { body: body.subarray(0, body.length - 400), contentType });
    assert.equal(res.status, 400);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await count(), 0);
    assert.deepEqual(tempFiles(), []);
  });

  await t.test('only trusted origins can submit (CSRF origin check applies)', async () => {
    const parts = buildMultipart({});
    assert.equal((await submit(ctx, parts, { origin: 'https://evil.example.com' })).status, 403);
    assert.equal((await submit(ctx, parts, { origin: null })).status, 403);
    assert.equal(await count(), 0);
  });
});
