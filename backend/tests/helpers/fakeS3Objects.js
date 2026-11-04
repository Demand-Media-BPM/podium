// Object-level S3 operations for the fake S3 server (HEAD, GET with ranges and presigned-URL checks, DELETE, PUT,
// and copy with If-Match). See fakeS3Server.js. Test double only.

const xmlError = (code, message) =>
  `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;

// A presigned GET needs X-Amz-Signature and must not be past X-Amz-Date + X-Amz-Expires.
function presignedGetProblem(url, now) {
  const sp = url.searchParams;
  if (!sp.get('X-Amz-Signature') || !sp.get('X-Amz-Date') || !sp.get('X-Amz-Expires')) return 'AccessDenied';
  const d = sp.get('X-Amz-Date');
  const issued = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(9, 11), +d.slice(11, 13), +d.slice(13, 15));
  return now.getTime() > issued + Number(sp.get('X-Amz-Expires')) * 1000 ? 'ExpiredToken' : null;
}

function createObjectHandler({ objects, put, send, log, state }) {
  const metaHeaders = (o) => ({
    'content-type': o.contentType,
    etag: o.etag,
    'last-modified': o.lastModified.toUTCString(),
    'x-amz-server-side-encryption': o.encryption || 'AES256',
    ...Object.fromEntries(Object.entries(o.metadata).map(([k, v]) => [`x-amz-meta-${k}`, v])),
  });

  function get(req, res, url, object) {
    const denied = presignedGetProblem(url, state.clock());
    // The AWS SDK signs its own requests with an Authorization header; browsers use the presigned query string.
    if (denied && !req.headers.authorization) return send(res, 403, { 'content-type': 'application/xml' }, xmlError(denied, 'Access Denied'));
    if (!object) return send(res, 404, { 'content-type': 'application/xml' }, xmlError('NoSuchKey', 'The specified key does not exist.'));

    const headers = metaHeaders(object);
    const type = url.searchParams.get('response-content-type');
    const disposition = url.searchParams.get('response-content-disposition');
    if (type) headers['content-type'] = type;
    if (disposition) headers['content-disposition'] = disposition;

    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : object.body.length - 1, object.body.length - 1);
      const slice = object.body.subarray(start, end + 1);
      return send(res, 206, { ...headers, 'content-length': slice.length, 'content-range': `bytes ${start}-${end}/${object.body.length}` }, slice);
    }
    return send(res, 200, { ...headers, 'content-length': object.body.length }, object.body);
  }

  function copy(req, res, key, source) {
    const sourceKey = decodeURIComponent(String(source).replace(/^\//, '').split('/').slice(1).join('/'));
    const original = objects.get(sourceKey);
    if (!original) return send(res, 404, { 'content-type': 'application/xml' }, xmlError('NoSuchKey', 'Source missing'));
    const ifMatch = req.headers['x-amz-copy-source-if-match'];
    if (ifMatch && ifMatch !== original.etag) {
      return send(res, 412, { 'content-type': 'application/xml' }, xmlError('PreconditionFailed', 'At least one precondition failed'));
    }
    const result = put(key, original.body, {
      contentType: original.contentType,
      metadata: original.metadata,
      encryption: req.headers['x-amz-server-side-encryption'],
    });
    log.push({ method: 'COPY', key });
    const xml = `<?xml version="1.0"?><CopyObjectResult><ETag>${result.etag}</ETag><LastModified>${result.lastModified.toISOString()}</LastModified></CopyObjectResult>`;
    return send(res, 200, { 'content-type': 'application/xml' }, xml);
  }

  return function handleObject(req, res, url, key) {
    const object = objects.get(key);
    if (req.method === 'HEAD') {
      if (!object) return send(res, 404);
      return send(res, 200, { ...metaHeaders(object), 'content-length': object.body.length });
    }
    if (req.method === 'GET') return get(req, res, url, object);
    if (req.method === 'DELETE') {
      objects.delete(key);
      log.push({ method: 'DELETE', key });
      return send(res, 204);
    }
    if (req.method === 'PUT') {
      if (req.headers['x-amz-copy-source']) return copy(req, res, key, req.headers['x-amz-copy-source']);
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        put(key, Buffer.concat(chunks), { contentType: req.headers['content-type'], encryption: req.headers['x-amz-server-side-encryption'] });
        log.push({ method: 'PUT', key });
        send(res, 200, { etag: objects.get(key).etag });
      });
      return undefined;
    }
    return send(res, 405);
  };
}

module.exports = { createObjectHandler, xmlError };
