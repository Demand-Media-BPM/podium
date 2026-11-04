const { setupService, REQUEST_ID, RESPONSE_ID } = require('../helpers/s3UnitSetup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { webmBytes } = require('../helpers/videoFixtures');
const { newUploadKey, finalKeyFor } = require('../../services/objectKeys');

test('head, ranged read, promote (copy), and delete', async (t) => {
  const { service, fake } = await setupService(t);
  const key = newUploadKey(REQUEST_ID, 'video/webm');
  const data = webmBytes(5000);
  fake.put(key, data, { contentType: 'video/webm', metadata: { 'response-id': RESPONSE_ID } });

  assert.equal(await service.head(finalKeyFor(key)), null, 'a missing object is null, not an error');
  const info = await service.head(key);
  assert.equal(info.size, 5000);
  assert.deepEqual(await service.readStart(key, 8), data.subarray(0, 8), 'only the first bytes are read');
  assert.equal(await service.readStart(finalKeyFor(key)), null);

  const promoted = await service.promote(key, info.etag);
  assert.equal(promoted.key, finalKeyFor(key));
  assert.equal(promoted.size, 5000);
  assert.ok(promoted.lastModified instanceof Date);
  assert.equal(fake.objects.get(finalKeyFor(key)).encryption, 'AES256');

  await service.deleteObject(key);
  assert.equal(await service.head(key), null);
  await service.deleteObject(key); // deleting again is fine
});

test('promote refuses an object that changed after it was verified (If-Match)', async (t) => {
  const { service, fake } = await setupService(t);
  const key = newUploadKey(REQUEST_ID, 'video/webm');
  fake.put(key, webmBytes(5000), { contentType: 'video/webm' });
  const verified = await service.head(key);
  fake.put(key, webmBytes(5000).fill(0x42, 100), { contentType: 'video/webm' }); // swapped after verification
  assert.deepEqual(await service.promote(key, verified.etag), { changed: true });
  assert.equal(fake.keys().filter((k) => k.startsWith('responses/')).length, 0, 'nothing was promoted');
});

test('signed GET URLs: short-lived, private without the signature, with a safe download name', async (t) => {
  const { service, fake } = await setupService(t);
  const key = finalKeyFor(newUploadKey(REQUEST_ID, 'video/webm'));
  fake.put(key, webmBytes(5000), { contentType: 'video/webm' });

  const play = new URL(await service.signPlaybackUrl(key, 'video/webm'));
  assert.equal(play.searchParams.get('X-Amz-Expires'), '60');
  assert.equal(play.searchParams.get('response-content-disposition'), 'inline');
  assert.equal((await fetch(play)).status, 200);

  const dl = new URL(await service.signDownloadUrl(key, 'video/webm', 'response-"evil";\r\nname.webm'));
  assert.equal(dl.searchParams.get('X-Amz-Expires'), '60');
  const disposition = dl.searchParams.get('response-content-disposition');
  assert.match(disposition, /^attachment; filename="[A-Za-z0-9._-]+"$/);
  assert.equal((await fetch(dl)).headers.get('content-disposition'), disposition);

  // The bucket is private: the same object without the signature, or past its expiry, is refused.
  assert.equal((await fetch(`${fake.url}/${fake.bucket}/${key}`)).status, 403);
  fake.state.clock = () => new Date(Date.now() + 61 * 1000);
  assert.equal((await fetch(play)).status, 403, 'the URL stops working after 60 seconds');
});

test('storage errors become a generic 502 that never leaks details', async (t) => {
  const { service, fake } = await setupService(t);
  fake.failNext('HEAD', 5);
  await assert.rejects(service.head(newUploadKey(REQUEST_ID, 'video/webm')), (err) => {
    assert.equal(err.statusCode, 502);
    assert.equal(err.code, 'STORAGE_UNAVAILABLE');
    assert.doesNotMatch(err.message, /Injected|InternalError|pending\/|vrt-test-bucket/);
    return true;
  });
});
