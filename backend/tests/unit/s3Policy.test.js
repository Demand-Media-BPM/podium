const { setupService, postUpload, REQUEST_ID, RESPONSE_ID, creds } = require('../helpers/s3UnitSetup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { webmBytes } = require('../helpers/videoFixtures');
const { newUploadKey, finalKeyFor } = require('../../services/objectKeys');

test('object keys are generated server-side and re-validated', () => {
  const key = newUploadKey(REQUEST_ID, 'video/webm');
  assert.match(key, /^pending\/[0-9a-f]{24}\/[0-9a-f-]{36}\.webm$/);
  assert.match(finalKeyFor(key), /^responses\/[0-9a-f]{24}\/[0-9a-f-]{36}\.webm$/);
  assert.notEqual(newUploadKey(REQUEST_ID, 'video/webm'), key);
  assert.match(newUploadKey(REQUEST_ID, 'video/mp4'), /\.mp4$/);
  assert.throws(() => newUploadKey('../x', 'video/webm'));
  assert.throws(() => newUploadKey(REQUEST_ID, 'application/x-msdownload'));
  assert.throws(() => finalKeyFor('responses/x/y.webm'));
});

test('the service refuses keys outside its own prefixes', async (t) => {
  const { service } = await setupService(t);
  for (const bad of ['../etc/passwd', 'other/file.webm', 'responses/../secret', 'pending/x.webm', '']) {
    await assert.rejects(service.head(bad), /Refusing/, bad);
    await assert.rejects(service.deleteObject(bad), /Refusing/, bad);
  }
  await assert.rejects(service.signPlaybackUrl(newUploadKey(REQUEST_ID, 'video/webm'), 'video/webm'), /Refusing/, 'pending keys cannot be played');
  const finalKey = finalKeyFor(newUploadKey(REQUEST_ID, 'video/webm'));
  await assert.rejects(
    service.createUploadAuthorization({ key: finalKey, mimeType: 'video/webm', size: 5000, responseId: RESPONSE_ID }),
    /Refusing/,
    'an upload can never be authorized straight into responses/'
  );
});

test('presigned POST: pinned to one key, one size, one type, with SSE-S3 and a 5 minute lifetime', async (t) => {
  const { service } = await setupService(t);
  const key = newUploadKey(REQUEST_ID, 'video/webm');
  const auth = await service.createUploadAuthorization({ key, mimeType: 'video/webm', size: 5000, responseId: RESPONSE_ID });
  const policy = JSON.parse(Buffer.from(auth.fields.Policy, 'base64').toString());

  assert.equal(auth.fields.key, key);
  assert.deepEqual(policy.conditions.find((c) => c.key), { key });
  assert.deepEqual(policy.conditions.find((c) => c[0] === 'content-length-range'), ['content-length-range', 5000, 5000]);
  assert.ok(policy.conditions.some((c) => c[0] === 'eq' && c[1] === '$Content-Type' && c[2] === 'video/webm'));
  assert.ok(policy.conditions.some((c) => c[0] === 'eq' && c[1] === '$x-amz-server-side-encryption' && c[2] === 'AES256'));
  assert.ok(policy.conditions.some((c) => c[0] === 'eq' && c[1] === `$x-amz-meta-response-id` && c[2] === RESPONSE_ID));
  const lifetime = (new Date(policy.expiration) - Date.now()) / 1000;
  assert.ok(lifetime > 280 && lifetime <= 301, `lifetime ${lifetime}s`);
  assert.ok(Math.abs((auth.expiresAt - Date.now()) / 1000 - 300) < 5);
  assert.ok(!JSON.stringify(auth).includes(creds.secretAccessKey), 'the secret key is never part of the authorization');
});

test('S3 policy enforcement: only the exact authorized upload is accepted', async (t) => {
  const { service, fake } = await setupService(t);
  const data = webmBytes(5000);
  const mk = () => service.createUploadAuthorization({ key: newUploadKey(REQUEST_ID, 'video/webm'), mimeType: 'video/webm', size: 5000, responseId: RESPONSE_ID });
  const otherKey = (prefix) => `${prefix}/${REQUEST_ID}/${crypto.randomUUID()}.webm`;

  const ok = await mk();
  assert.equal((await postUpload(ok, data)).status, 204);
  const stored = await service.head(ok.fields.key);
  assert.deepEqual(stored.metadata, { 'response-id': RESPONSE_ID });
  assert.equal(stored.encryption, 'AES256');

  const refused = [
    ['a larger file', webmBytes(5001), {}],
    ['a smaller file', webmBytes(4999), {}],
    ['an oversized (100 MiB + 1) file', webmBytes(104857601), {}],
    ['another pending key', data, { key: otherKey('pending') }],
    ['a final (responses/) key', data, { key: otherKey('responses') }],
    ['another content type', data, { 'Content-Type': 'text/html' }],
    ['a different encryption setting', data, { 'x-amz-server-side-encryption': 'aws:kms' }],
    ['other response-id metadata', data, { 'x-amz-meta-response-id': '0'.repeat(24) }],
    ['extra metadata', data, { 'x-amz-meta-evil': '1' }],
    ['a public ACL', data, { acl: 'public-read' }],
  ];
  for (const [label, body, fields] of refused) {
    const auth = await mk();
    const before = fake.keys().length;
    const res = await postUpload(auth, body, { fields });
    assert.ok(res.status >= 400, `${label} must be refused, got ${res.status}`);
    assert.equal(fake.keys().length, before, `${label}: nothing may be stored`);
  }
});

test('an expired presigned POST is refused', async (t) => {
  const { service, fake } = await setupService(t);
  const auth = await service.createUploadAuthorization({ key: newUploadKey(REQUEST_ID, 'video/webm'), mimeType: 'video/webm', size: 5000, responseId: RESPONSE_ID });
  fake.state.clock = () => new Date(Date.now() + 301 * 1000);
  assert.equal((await postUpload(auth, webmBytes(5000))).status, 403);
  assert.equal(fake.keys().length, 0);
});
