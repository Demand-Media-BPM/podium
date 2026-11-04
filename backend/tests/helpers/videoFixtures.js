const fs = require('fs');

// Minimal byte sequences that carry the real container signatures. They are not playable videos:
// the backend only verifies the container signature, so these are enough to exercise it.

function webmBytes(totalSize = 4096) {
  const header = Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3, // EBML magic
    0x9f, // header size
    0x42, 0x86, 0x81, 0x01, // EBMLVersion 1
    0x42, 0xf7, 0x81, 0x01, // EBMLReadVersion 1
    0x42, 0xf2, 0x81, 0x04, // EBMLMaxIDLength 4
    0x42, 0xf3, 0x81, 0x08, // EBMLMaxSizeLength 8
    0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, // DocType "webm"
    0x42, 0x87, 0x81, 0x04, // DocTypeVersion 4
    0x42, 0x85, 0x81, 0x02, // DocTypeReadVersion 2
  ]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, totalSize - header.length), 0x41)]);
}

function mp4Bytes(totalSize = 4096, brand = 'isom', compatible = ['isom', 'mp42']) {
  const ftyp = Buffer.alloc(16 + compatible.length * 4);
  ftyp.writeUInt32BE(ftyp.length, 0);
  ftyp.write('ftyp', 4, 'latin1');
  ftyp.write(brand, 8, 'latin1');
  ftyp.writeUInt32BE(512, 12);
  compatible.forEach((entry, index) => ftyp.write(entry, 16 + index * 4, 'latin1'));
  return Buffer.concat([ftyp, Buffer.alloc(Math.max(0, totalSize - ftyp.length), 0x42)]);
}

const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4096)]);
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4096, 0x20)]);
const EXE_BYTES = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(4096)]);
const TEXT_BYTES = Buffer.from('<script>alert(1)</script>'.repeat(200));

const VALID_FIELDS = () => ({
  submissionId: require('crypto').randomUUID(),
  clientName: 'Carla Client',
  clientEmail: 'carla@example.com',
  consentAccepted: 'true',
  durationSeconds: '42.5',
});

// Builds a multipart body by hand so tests control every byte. `file` is { name, type, data } or null.
function buildMultipart({ fields = VALID_FIELDS(), file = { name: 'recording.webm', type: 'video/webm', data: webmBytes() }, fileField = 'video' } = {}) {
  const boundary = `----vrt${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`
      ),
      file.data,
      Buffer.from('\r\n')
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// Lists the files (recursively) under a directory; used to prove no temp/orphan files are left behind.
function listFiles(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...listFiles(full));
    else found.push(full);
  }
  return found;
}

module.exports = { webmBytes, mp4Bytes, buildMultipart, listFiles, VALID_FIELDS, PNG_BYTES, PDF_BYTES, EXE_BYTES, TEXT_BYTES };
