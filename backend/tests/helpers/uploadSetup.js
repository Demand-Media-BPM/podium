const fs = require('fs');
const { startTestServer, loginAs, tokenFromUrl, postMultipart } = require('./testServer');
const { Response } = require('../../models');
const videoStore = require('../../services/videoStore');
const { listFiles } = require('./videoFixtures');

// Shared helpers for the response-upload integration tests.

const filesOnDisk = () => listFiles(videoStore.rootDir);
const committedFiles = () => filesOnDisk().filter((file) => !file.includes('.tmp'));
const tempFiles = () => filesOnDisk().filter((file) => file.includes('.tmp'));
const count = () => Response.countDocuments({});

// Starts a test server with its own upload folder, an employee, and one active request.
async function setup(t, appOptions) {
  const server = await startTestServer({ loginRateLimit: { limit: 1000 }, uploadRateLimit: { limit: 1000 }, ...appOptions });
  t.after(async () => {
    await server.stop();
    fs.rmSync(videoStore.rootDir, { recursive: true, force: true });
  });
  const { client, user } = await loginAs(server.baseUrl, { email: 'erin@example.com' });
  const created = (await client.post('/api/requests', { title: 'Intro', question: 'Tell us about yourself' })).json;
  return { ...server, client, user, requestId: created.request.id, token: tokenFromUrl(created.url) };
}

const submit = (ctx, parts, options) => postMultipart(ctx.baseUrl, `/api/public/${ctx.token}/responses`, parts, options);

module.exports = { setup, submit, filesOnDisk, committedFiles, tempFiles, count };
