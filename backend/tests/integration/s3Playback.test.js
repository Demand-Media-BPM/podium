require('../helpers/setupS3Env');
const { hasMongo, createClient, loginAs } = require('../helpers/testServer');
const { setupS3, submitVideo, initiate, initiateBody } = require('../helpers/s3Setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Response } = require('../../models');
const { webmBytes } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('secure playback and download (integration, fake S3)', { skip }, async (t) => {
  const ctx = await setupS3(t);
  const bob = await loginAs(ctx.baseUrl, { email: 'bob@example.com', name: 'Bob' });
  const admin = await loginAs(ctx.baseUrl, { email: 'ada@example.com', name: 'Ada', role: 'admin' });
  const anon = createClient(ctx.baseUrl);

  const sent = await submitVideo(ctx, webmBytes(5000), { clientName: 'Carla <b>Client</b>' });
  const id = sent.responseId;
  const doc = await Response.findById(id).select('+videoKey').lean();

  await t.test('the owner gets a 60 second signed URL that really serves the video', async () => {
    const res = await ctx.client.get(`/api/responses/${id}/play`);
    assert.equal(res.status, 200);
    assert.equal(res.json.kind, 'signed');
    assert.equal(res.json.expiresInSeconds, 60);
    const url = new URL(res.json.url);
    assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
    assert.equal(url.searchParams.get('response-content-disposition'), 'inline');
    const video = await fetch(url);
    assert.equal(video.status, 200);
    assert.deepEqual(Buffer.from(await video.arrayBuffer()), webmBytes(5000));
  });

  await t.test('responses carrying signed URLs are never cached', async () => {
    const res = await ctx.client.get(`/api/responses/${id}/play`);
    assert.match(res.headers.get('cache-control'), /no-store/);
    assert.match(res.headers.get('cache-control'), /private/);
    assert.equal(res.headers.get('pragma'), 'no-cache');
  });

  await t.test('the signed URL stops working after it expires', async () => {
    const res = await ctx.client.get(`/api/responses/${id}/play`);
    assert.equal((await fetch(res.json.url)).status, 200);
    ctx.s3.state.clock = () => new Date(Date.now() + 61 * 1000);
    assert.equal((await fetch(res.json.url)).status, 403);
    ctx.s3.state.clock = () => new Date();
  });

  await t.test('the bucket is private: the same object without a signature is refused', async () => {
    assert.equal((await fetch(`${ctx.s3.url}/${ctx.s3.bucket}/${doc.videoKey}`)).status, 403);
  });

  await t.test('download uses a safe generated file name and an attachment disposition', async () => {
    const res = await ctx.client.get(`/api/responses/${id}/download`);
    assert.equal(res.status, 200);
    assert.match(res.json.filename, /^response-carla-b-client-b-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}\.webm$/);
    const url = new URL(res.json.url);
    assert.equal(url.searchParams.get('response-content-disposition'), `attachment; filename="${res.json.filename}"`);
    assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
    const file = await fetch(url);
    assert.equal(file.headers.get('content-disposition'), `attachment; filename="${res.json.filename}"`);
    assert.doesNotMatch(res.json.filename, /[<>"';\\/\s]/, 'the client-supplied name cannot inject anything');
    assert.match(res.headers.get('cache-control'), /no-store/);
  });

  await t.test('other employees and anonymous visitors get nothing; admins can watch', async () => {
    for (const action of ['play', 'download']) {
      const url = `/api/responses/${id}/${action}`;
      assert.equal((await bob.client.get(url)).status, 404, `bob ${action}`);
      assert.equal((await anon.get(url)).status, 401, `anon ${action}`);
      assert.equal((await admin.client.get(url)).status, 200, `admin ${action}`);
    }
    const missing = await bob.client.get(`/api/responses/${'0'.repeat(24)}/play`);
    assert.equal(missing.status, 404);
    assert.equal((await bob.client.get('/api/responses/nope/play')).status, 400);
    assert.equal((await bob.client.get(`/api/responses/${id}/play`)).text, missing.text, 'not yours looks the same as missing');
  });

  await t.test('play answers contain only the signed URL and basic facts', async () => {
    const play = await ctx.client.get(`/api/responses/${id}/play`);
    assert.deepEqual(Object.keys(play.json).sort(), ['expiresInSeconds', 'kind', 'mimeType', 'success', 'url']);
  });

  await t.test('pending uploads cannot be played or downloaded', async () => {
    const started = (await initiate(ctx, initiateBody(webmBytes(5000)))).json;
    assert.equal((await ctx.client.get(`/api/responses/${started.responseId}/play`)).status, 404);
    assert.equal((await ctx.client.get(`/api/responses/${started.responseId}/download`)).status, 404);
  });

  await t.test('a video deleted from S3 gives a clear "no longer available" answer', async () => {
    ctx.s3.objects.delete(doc.videoKey);
    for (const action of ['play', 'download']) {
      const res = await ctx.client.get(`/api/responses/${id}/${action}`);
      assert.equal(res.status, 410, action);
      assert.equal(res.json.code, 'VIDEO_MISSING');
    }
  });

  await t.test('storage trouble is a generic 502, never S3 details', async () => {
    const other = await submitVideo(ctx, webmBytes(5000));
    ctx.s3.failNext('HEAD', 3);
    const res = await ctx.client.get(`/api/responses/${other.responseId}/play`);
    assert.equal(res.status, 502);
    assert.equal(res.json.code, 'STORAGE_UNAVAILABLE');
    assert.doesNotMatch(res.text, /Injected|InternalError|vrt-test-bucket/);
  });
});
