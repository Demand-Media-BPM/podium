const fs = require('fs');
const { startTestServer, createClient, loginAs, tokenFromUrl, postMultipart } = require('./testServer');
const videoStore = require('../../services/videoStore');
const { webmBytes, buildMultipart, VALID_FIELDS } = require('./videoFixtures');

// Two employees, an admin and an anonymous visitor, with real uploaded responses:
//   alice: "Alice request" (responses First, Second) and "Alice empty" (none)
//   bob:   "Bob request"   (response Third)
async function setupAccess(t) {
  const server = await startTestServer({ loginRateLimit: { limit: 1000 }, uploadRateLimit: { limit: 1000 } });
  t.after(async () => {
    await server.stop();
    fs.rmSync(videoStore.rootDir, { recursive: true, force: true });
  });
  const { baseUrl } = server;

  const alice = await loginAs(baseUrl, { email: 'alice@example.com', name: 'Alice' });
  const bob = await loginAs(baseUrl, { email: 'bob@example.com', name: 'Bob' });
  const admin = await loginAs(baseUrl, { email: 'admin@example.com', name: 'Admin', role: 'admin' });
  const anon = createClient(baseUrl);

  const makeRequest = async (client, title) => {
    const created = (await client.post('/api/requests', { title, question: 'Q?' })).json;
    return { id: created.request.id, token: tokenFromUrl(created.url) };
  };
  const aliceRequest = await makeRequest(alice.client, 'Alice request');
  const bobRequest = await makeRequest(bob.client, 'Bob request');
  const emptyRequest = await makeRequest(alice.client, 'Alice empty');

  const upload = async (request, name) => {
    const res = await postMultipart(
      baseUrl,
      `/api/public/${request.token}/responses`,
      buildMultipart({
        fields: { ...VALID_FIELDS(), clientName: name, clientEmail: `${name.toLowerCase()}@example.com` },
        file: { name: 'r.webm', type: 'video/webm', data: webmBytes(5000) },
      })
    );
    if (res.status !== 201) throw new Error(`setup upload failed with ${res.status}`);
  };
  await upload(aliceRequest, 'First');
  await upload(aliceRequest, 'Second');
  await upload(bobRequest, 'Third');

  const listOf = (client, request) => client.get(`/api/requests/${request.id}/responses`);
  return { baseUrl, alice, bob, admin, anon, aliceRequest, bobRequest, emptyRequest, listOf };
}

module.exports = { setupAccess };
