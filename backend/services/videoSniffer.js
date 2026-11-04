const fs = require('fs/promises');

// Recognises the container format from the file's own bytes. The filename and the Content-Type sent by the
// client are untrusted, so they are never used to decide what a file is.
//
// Supported: WebM (Chrome, Edge, Firefox, Android) and MP4 (Safari / iOS, newer Chrome).
// This checks the container signature only. It does not prove the file is a playable video.

const HEADER_BYTES = 512;

const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
// EBML DocType element (0x4282), 4-byte string "webm".
const WEBM_DOCTYPE = Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]);

const MP4_BRANDS = new Set([
  'isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9',
  'mp41', 'mp42', 'avc1', 'dash', 'cmfc', 'M4V ',
]);

function sniffWebm(buffer) {
  if (buffer.length < 16 || !buffer.subarray(0, 4).equals(EBML_MAGIC)) return null;
  // The DocType sits inside the EBML header, which is always within the first bytes of the file.
  return buffer.subarray(0, 128).includes(WEBM_DOCTYPE) ? { mimeType: 'video/webm', extension: 'webm' } : null;
}

function sniffMp4(buffer) {
  if (buffer.length < 16 || buffer.toString('latin1', 4, 8) !== 'ftyp') return null;
  const boxSize = buffer.readUInt32BE(0);
  // ftyp = size(4) + 'ftyp'(4) + major brand(4) + minor version(4) + compatible brands(4 each).
  if (boxSize < 16 || boxSize > Math.min(buffer.length, 256)) return null;

  const brands = [buffer.toString('latin1', 8, 12)];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.push(buffer.toString('latin1', offset, offset + 4));
  }
  return brands.some((brand) => MP4_BRANDS.has(brand)) ? { mimeType: 'video/mp4', extension: 'mp4' } : null;
}

// Returns { mimeType, extension } or null when the bytes are not a supported video container.
function sniffVideoBuffer(buffer) {
  return sniffWebm(buffer) || sniffMp4(buffer);
}

async function sniffVideoFile(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return sniffVideoBuffer(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

module.exports = { sniffVideoBuffer, sniffVideoFile };
