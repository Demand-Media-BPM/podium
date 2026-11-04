require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createVideoStore } = require('../../services/videoStore');

const REQUEST_ID = '64b7f0c2a1b2c3d4e5f60718';

function makeStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createVideoStore(dir);
  store.ensureDirsSync();
  return store;
}

test('keys are generated server-side with a random name and a fixed extension', () => {
  const store = createVideoStore(os.tmpdir());
  const a = store.buildKey(REQUEST_ID, 'webm');
  const b = store.buildKey(REQUEST_ID, 'webm');
  assert.match(a, /^[0-9a-f]{24}\/[0-9a-f-]{36}\.webm$/);
  assert.notEqual(a, b);
  assert.throws(() => store.buildKey('../evil', 'webm'));
  assert.throws(() => store.buildKey(REQUEST_ID, 'exe'));
  assert.throws(() => store.buildKey(REQUEST_ID, 'webm/../../x'));
});

test('resolveKey only accepts well-formed keys and rejects traversal and absolute paths', (t) => {
  const store = makeStore(t);
  const good = store.buildKey(REQUEST_ID, 'mp4');
  assert.equal(store.resolveKey(good), path.join(store.rootDir, REQUEST_ID, good.split('/')[1]));

  const uuid = crypto.randomUUID();
  const bad = [
    `../${uuid}.webm`,
    `${REQUEST_ID}/../../${uuid}.webm`,
    `${REQUEST_ID}/${uuid}.webm/../../../x.webm`,
    `/etc/passwd`,
    `C:\\Windows\\win.ini`,
    `${REQUEST_ID}\\${uuid}.webm`,
    `${REQUEST_ID}/${uuid}.exe`,
    `${REQUEST_ID}/${uuid}.webm\u0000.png`,
    `.tmp/${uuid}.part`,
    `${REQUEST_ID}/${uuid}.WEBM`,
    '',
    null,
    undefined,
    { toString: () => good },
    42,
  ];
  for (const key of bad) assert.equal(store.resolveKey(key), null, String(key));
});

test('commit moves a temp file into place and refuses unsafe paths', async (t) => {
  const store = makeStore(t);
  const temp = path.join(store.tempDir, store.newTempName());
  fs.writeFileSync(temp, 'video-bytes');
  const key = store.buildKey(REQUEST_ID, 'webm');

  await store.commit(temp, key);
  assert.equal(fs.existsSync(temp), false);
  assert.equal(fs.readFileSync(store.resolveKey(key), 'utf8'), 'video-bytes');

  // A file outside the temp directory can never be committed (it could be any file on the disk).
  const outside = path.join(os.tmpdir(), `outside-${crypto.randomUUID()}.part`);
  fs.writeFileSync(outside, 'x');
  t.after(() => fs.rmSync(outside, { force: true }));
  await assert.rejects(store.commit(outside, store.buildKey(REQUEST_ID, 'webm')));
  await assert.rejects(store.commit(temp, '../escape.webm'));
  assert.equal(fs.existsSync(outside), true, 'file outside the store is untouched');
});

test('removeTemp and removeKey only delete files that belong to the store', async (t) => {
  const store = makeStore(t);
  const temp = path.join(store.tempDir, store.newTempName());
  fs.writeFileSync(temp, 'x');
  await store.removeTemp(temp);
  assert.equal(fs.existsSync(temp), false);

  const outside = path.join(os.tmpdir(), `keep-${crypto.randomUUID()}.part`);
  fs.writeFileSync(outside, 'x');
  t.after(() => fs.rmSync(outside, { force: true }));
  await store.removeTemp(outside);
  await store.removeKey('../../anything');
  assert.equal(fs.existsSync(outside), true);
});

test('removeStaleTemp deletes only old partial uploads', async (t) => {
  const store = makeStore(t);
  const oldFile = path.join(store.tempDir, store.newTempName());
  const freshFile = path.join(store.tempDir, store.newTempName());
  const unrelated = path.join(store.tempDir, 'notes.txt');
  for (const file of [oldFile, freshFile, unrelated]) fs.writeFileSync(file, 'x');
  const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, past, past);
  fs.utimesSync(unrelated, past, past);

  assert.equal(await store.removeStaleTemp(), 1);
  assert.equal(fs.existsSync(oldFile), false);
  assert.equal(fs.existsSync(freshFile), true);
  assert.equal(fs.existsSync(unrelated), true);
});
