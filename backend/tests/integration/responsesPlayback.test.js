const { hasMongo } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Response } = require('../../models');
const videoStore = require('../../services/videoStore');
const { setupAccess } = require('../helpers/accessSetup');
const { webmBytes } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

test('development video playback (integration)', { skip }, async (t) => {
  const { baseUrl, alice, bob, admin, anon, aliceRequest, bobRequest, listOf } = await setupAccess(t);
  const oldest = async () => (await listOf(alice.client, aliceRequest)).json.responses.slice(-1)[0];
  const videoPath = (request, response) => `/api/requests/${request.id}/responses/${response.id}/video`;

  await t.test('streams the video to its owner with safe headers', async () => {
    const res = await fetch(`${baseUrl}${videoPath(aliceRequest, await oldest())}`, { headers: { Cookie: alice.client.getCookie() } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'video/webm');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('cache-control'), /no-store/);
    assert.equal(res.headers.get('accept-ranges'), 'bytes');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), webmBytes(5000));
  });

  await t.test('supports Range requests so the browser can seek', async () => {
    const res = await fetch(`${baseUrl}${videoPath(aliceRequest, await oldest())}`, {
      headers: { Cookie: alice.client.getCookie(), Range: 'bytes=0-9' },
    });
    assert.equal(res.status, 206);
    assert.equal((await res.arrayBuffer()).byteLength, 10);
  });

  await t.test('is refused for other employees, anonymous users and mismatched ids; admins may watch', async () => {
    const first = await oldest();
    const url = videoPath(aliceRequest, first);
    assert.equal((await bob.client.get(url)).status, 404);
    assert.equal((await anon.get(url)).status, 401);
    assert.equal((await bob.client.get(videoPath(bobRequest, first))).status, 404, "Alice's response under Bob's request");
    assert.equal((await alice.client.get(videoPath(bobRequest, first))).status, 404);
    assert.equal((await admin.client.get(url)).status, 200);
  });

  await t.test('a tampered or missing stored key never reads outside the upload folder', async () => {
    const outside = path.join(path.dirname(videoStore.rootDir), `secret-${process.pid}.txt`);
    fs.writeFileSync(outside, 'TOP SECRET');
    t.after(() => fs.rmSync(outside, { force: true }));

    const target = await Response.findOne({ clientName: 'Second' }).lean();
    const url = `/api/requests/${aliceRequest.id}/responses/${target._id}/video`;
    const keys = ['../' + path.basename(outside), '../../etc/passwd', `${aliceRequest.id}/../../${path.basename(outside)}`, path.resolve(outside), ''];
    for (const key of keys) {
      await Response.updateOne({ _id: target._id }, { videoKey: key });
      const res = await alice.client.get(url);
      assert.equal(res.status, 404, key);
      assert.ok(!res.text.includes('TOP SECRET'));
    }
    // A well-formed key whose file is gone is a plain 404 too.
    await Response.updateOne({ _id: target._id }, { videoKey: `${aliceRequest.id}/00000000-0000-0000-0000-000000000000.webm` });
    assert.equal((await alice.client.get(url)).status, 404);
  });

  await t.test('the upload folder is not served: no static route exposes it', async () => {
    const doc = await Response.findOne({ clientName: 'Third' }).select('+videoKey').lean();
    const paths = [`/${doc.videoKey}`, `/uploads/${doc.videoKey}`, `/storage/uploads/${doc.videoKey}`, `/api/uploads/${doc.videoKey}`, '/uploads/', '/storage/'];
    for (const p of paths) {
      const res = await anon.get(p);
      assert.ok([401, 404].includes(res.status), `${p} -> ${res.status}`);
    }
  });
});
