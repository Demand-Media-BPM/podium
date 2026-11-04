require('./setupS3Env');
const crypto = require('crypto');
const { startTestServer, loginAs, tokenFromUrl, createClient } = require('./testServer');
const { startFakeS3 } = require('./fakeS3Server');
const { getS3Client, resetS3Client } = require('../../config/s3');
const config = require('../../config/env');
const { webmBytes } = require('./videoFixtures');

// A complete S3-mode environment for integration tests: the real application, MongoDB (test database), and the fake
// S3 server. The application's real AWS SDK code talks to the fake over HTTP. Nothing touches real AWS.

async function setupS3(t, appOptions) {
  const s3 = await startFakeS3();
  // Point the already-loaded configuration at the fake (config is a plain object, so tests can adjust it).
  config.s3.endpoint = s3.url;
  config.s3.forcePathStyle = true;
  resetS3Client();
  require('../../services/s3Service').setSharedS3Service(null);

  const server = await startTestServer({ loginRateLimit: { limit: 1000 }, uploadRateLimit: { limit: 1000 }, ...appOptions });
  t.after(async () => {
    await server.stop();
    await s3.close();
    resetS3Client();
    require('../../services/s3Service').setSharedS3Service(null);
  });

  const { client, user } = await loginAs(server.baseUrl, { email: 'erin@example.com' });
  const created = (await client.post('/api/requests', { title: 'Intro', question: 'Tell us about yourself' })).json;
  // ctx.get/post/patch are an ANONYMOUS client (a visitor with the public link and no session cookie).
  // ctx.client is the signed-in employee.
  const anon = createClient(server.baseUrl);
  return {
    ...server,
    s3,
    client,
    user,
    anon,
    get: anon.get,
    post: anon.post,
    patch: anon.patch,
    requestId: created.request.id,
    token: tokenFromUrl(created.url),
  };
}

const initiateBody = (data = webmBytes(5000), overrides = {}) => ({
  submissionId: crypto.randomUUID(),
  clientName: 'Carla Client',
  clientEmail: 'carla@example.com',
  consentAccepted: true,
  durationSeconds: 42.5,
  mimeType: 'video/webm',
  fileSize: data.length,
  ...overrides,
});

const initiate = (ctx, body, options) => ctx.post(`/api/public/${ctx.token}/uploads`, body, options);
const complete = (ctx, responseId, completionToken, options) =>
  ctx.post(`/api/public/${ctx.token}/uploads/${responseId}/complete`, { completionToken }, options);

// What the browser does with the presigned POST: a multipart form with the signed fields first, the file last.
async function uploadToS3(upload, data, { fieldOverrides = {}, extraFields = {}, contentType } = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries({ ...upload.fields, ...fieldOverrides, ...extraFields })) form.append(name, value);
  form.append('file', new Blob([data], { type: contentType || upload.fields['Content-Type'] }), 'recording.bin');
  const res = await fetch(upload.url, { method: 'POST', body: form });
  return { status: res.status, text: await res.text() };
}

// The whole happy path in one call. Returns everything a test may want to inspect.
async function submitVideo(ctx, data = webmBytes(5000), overrides = {}) {
  const body = initiateBody(data, overrides);
  const started = await initiate(ctx, body);
  if (started.status !== 201) throw new Error(`initiate failed: ${started.status} ${started.text}`);
  const { upload, responseId, completionToken } = started.json;
  const stored = await uploadToS3(upload, data);
  if (stored.status !== 204) throw new Error(`S3 upload failed: ${stored.status} ${stored.text}`);
  const done = await complete(ctx, responseId, completionToken);
  return { body, started, upload, responseId, completionToken, done };
}

module.exports = { setupS3, initiateBody, initiate, complete, uploadToS3, submitVideo, getS3Client };
