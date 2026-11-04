const http = require('http');
const crypto = require('crypto');
const Busboy = require('busboy');
const { checkPostPolicy } = require('./fakeS3Policy');
const { createObjectHandler, xmlError } = require('./fakeS3Objects');

// An in-process HTTP server that speaks enough of the S3 REST protocol for the application's real AWS SDK code:
// presigned POST uploads (policy enforced), HEAD, ranged GET, copy with If-Match, delete, and presigned GET URLs
// (a GET without a valid, unexpired signature is refused, like a private bucket). It is a TEST DOUBLE:
// it does not verify signatures and is not a substitute for testing against real AWS.

function startFakeS3({ bucket = 'vrt-test-bucket', port = 0 } = {}) {
  const objects = new Map(); // key -> { body, contentType, metadata, lastModified, etag, encryption }
  const faults = []; // [{ method, times }] one-shot injected 500 errors
  const log = []; // { method, key } of every request, for assertions
  const state = { clock: () => new Date() };

  const put = (key, body, { contentType = 'application/octet-stream', metadata = {}, lastModified = state.clock(), encryption = 'AES256' } = {}) => {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const etag = `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
    objects.set(key, { body: buffer, contentType, metadata, lastModified, etag, encryption });
    return objects.get(key);
  };

  // Like a bucket with the CORS rule from docs/aws/cors.json, so a browser on another origin may talk to it.
  const send = (res, status, headers = {}, body = '') => {
    res.writeHead(status, { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'ETag', ...headers });
    res.end(body);
  };

  // Browser-style form upload (a presigned POST): the policy conditions are enforced exactly like S3 does.
  function handlePost(req, res, url) {
    const fields = {};
    let file = null;
    const busboy = Busboy({ headers: req.headers });
    busboy.on('field', (name, value) => {
      fields[name] = value;
    });
    busboy.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        file = { body: Buffer.concat(chunks), contentType: info.mimeType };
      });
    });
    busboy.on('close', () => {
      if (url.pathname !== `/${bucket}`) return send(res, 404, {}, xmlError('NoSuchBucket', 'No such bucket'));
      const refusal = checkPostPolicy({ fields, fileSize: file ? file.body.length : 0, bucket, now: state.clock() });
      if (refusal) return send(res, refusal.status, { 'content-type': 'application/xml' }, xmlError(refusal.code, refusal.message));
      if (!file) return send(res, 400, {}, xmlError('InvalidArgument', 'No file'));
      const metadata = {};
      for (const [name, value] of Object.entries(fields)) {
        if (name.toLowerCase().startsWith('x-amz-meta-')) metadata[name.toLowerCase().slice(11)] = value;
      }
      put(fields.key, file.body, { contentType: fields['Content-Type'] || file.contentType, metadata, encryption: fields['x-amz-server-side-encryption'] });
      log.push({ method: 'POST', key: fields.key });
      return send(res, 204);
    });
    req.pipe(busboy);
  }

  const handleObject = createObjectHandler({ objects, put, send, log, state });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fake');
    const fault = faults.find((f) => f.method === req.method && f.times > 0);
    if (fault) {
      fault.times -= 1;
      req.resume();
      return send(res, 500, { 'content-type': 'application/xml' }, xmlError('InternalError', 'Injected failure'));
    }
    if (req.method === 'OPTIONS') return send(res, 204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST,GET,PUT' });
    if (req.method === 'POST') return handlePost(req, res, url);
    const match = new RegExp(`^/${bucket}/(.+)$`).exec(url.pathname);
    if (!match) return send(res, 403, { 'content-type': 'application/xml' }, xmlError('AccessDenied', 'Access Denied'));
    return handleObject(req, res, url, decodeURIComponent(match[1]));
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        bucket,
        url: `http://127.0.0.1:${server.address().port}`,
        objects,
        log,
        put,
        state,
        failNext: (method, times = 1) => faults.push({ method, times }),
        keys: () => [...objects.keys()],
        close: () =>
          new Promise((r) => {
            server.closeAllConnections?.();
            server.close(r);
          }),
      });
    });
  });
}

module.exports = { startFakeS3 };
