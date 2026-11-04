require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { sniffVideoBuffer } = require('../../services/videoSniffer');
const { webmBytes, mp4Bytes, PNG_BYTES, PDF_BYTES, EXE_BYTES, TEXT_BYTES } = require('../helpers/videoFixtures');

test('recognises WebM by its EBML header and "webm" doctype', () => {
  assert.deepEqual(sniffVideoBuffer(webmBytes()), { mimeType: 'video/webm', extension: 'webm' });
});

test('recognises MP4 by its ftyp box for common brands', () => {
  for (const brand of ['isom', 'mp42', 'mp41', 'iso2', 'avc1', 'dash']) {
    assert.deepEqual(sniffVideoBuffer(mp4Bytes(4096, brand)), { mimeType: 'video/mp4', extension: 'mp4' }, brand);
  }
});

test('rejects images, documents, executables and text, whatever they claim to be', () => {
  for (const bytes of [PNG_BYTES, PDF_BYTES, EXE_BYTES, TEXT_BYTES, Buffer.alloc(4096), Buffer.alloc(0)]) {
    assert.equal(sniffVideoBuffer(bytes), null);
  }
});

test('rejects a Matroska/EBML file that is not WebM', () => {
  const mkv = webmBytes();
  mkv.write('matr', 24, 'latin1'); // overwrite the "webm" doctype text
  mkv.fill(0x41, 21, 28);
  assert.equal(sniffVideoBuffer(mkv), null);
});

test('rejects a ftyp box with an unknown brand (e.g. HEIC image, QuickTime)', () => {
  assert.equal(sniffVideoBuffer(mp4Bytes(4096, 'heic', ['mif1', 'heic'])), null);
  assert.equal(sniffVideoBuffer(mp4Bytes(4096, 'qt  ', ['qt  '])), null);
  assert.equal(sniffVideoBuffer(mp4Bytes(4096, 'M4A ', ['M4A ', 'mp42'])).extension, 'mp4', 'a compatible isom/mp4 brand is enough');
});

test('rejects truncated and inconsistent headers without throwing', () => {
  assert.equal(sniffVideoBuffer(webmBytes().subarray(0, 6)), null);
  assert.equal(sniffVideoBuffer(mp4Bytes().subarray(0, 10)), null);
  const badSize = mp4Bytes();
  badSize.writeUInt32BE(0xffffffff, 0); // box claims to be larger than the buffer
  assert.equal(sniffVideoBuffer(badSize), null);
  const tiny = mp4Bytes();
  tiny.writeUInt32BE(4, 0);
  assert.equal(sniffVideoBuffer(tiny), null);
});
