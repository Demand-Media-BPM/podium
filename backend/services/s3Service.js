const {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const { isPendingKey, isFinalKey, finalKeyFor } = require('./objectKeys');

// Every S3 operation the application performs lives in this module. Each function re-checks the key shape, so the
// app can only touch objects under its own two prefixes (pending/ and responses/), never an arbitrary key.

const SSE = 'AES256'; // SSE-S3
const HEAD_BYTES = 512;
const UNAVAILABLE_MESSAGE = 'The video storage service is temporarily unavailable. Please try again.';

const isNotFound = (err) => ['NotFound', 'NoSuchKey'].includes(err?.name) || err?.$metadata?.httpStatusCode === 404;
const isPreconditionFailed = (err) => err?.name === 'PreconditionFailed' || err?.$metadata?.httpStatusCode === 412;

// Clients get a generic message; only the error name is logged (never keys, URLs or data).
function storageError(err, operation) {
  const status = err?.$metadata?.httpStatusCode ? ` ${err.$metadata.httpStatusCode}` : '';
  console.error(`S3 ${operation} failed (${err?.name || 'Error'}${status})`);
  return new AppError(502, UNAVAILABLE_MESSAGE, 'STORAGE_UNAVAILABLE');
}

const assertPending = (key) => {
  if (!isPendingKey(key)) throw new Error('Refusing to use a key outside the pending upload prefix');
};
const assertFinal = (key) => {
  if (!isFinalKey(key)) throw new Error('Refusing to use a key outside the responses prefix');
};
const assertOwnKey = (key) => {
  if (!isPendingKey(key) && !isFinalKey(key)) throw new Error('Refusing to use an unexpected key');
};

function createS3Service({ client, bucket = config.s3.bucket, settings = config.s3 } = {}) {
  // Metadata of an object, or null when it does not exist.
  async function head(key) {
    assertOwnKey(key);
    try {
      const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        size: r.ContentLength,
        contentType: r.ContentType,
        lastModified: r.LastModified,
        etag: r.ETag,
        metadata: r.Metadata || {},
        encryption: r.ServerSideEncryption,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw storageError(err, 'head');
    }
  }

  // The first bytes of an object, for the container-signature check (a ranged GET: nothing else is downloaded).
  async function readStart(key, bytes = HEAD_BYTES) {
    assertOwnKey(key);
    try {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
      return Buffer.from(await r.Body.transformToByteArray());
    } catch (err) {
      if (isNotFound(err)) return null;
      throw storageError(err, 'read');
    }
  }

  // A presigned POST pinned to ONE key. S3 itself rejects an upload whose size, type, encryption header or
  // response-id metadata differ from these conditions, or that arrives after the expiry. The size is pinned
  // exactly (min = max = the declared size), so the 2 GiB limit is enforced by S3, not only by the browser.
  async function createUploadAuthorization({ key, mimeType, size, responseId }) {
    assertPending(key);
    let post;
    try {
      post = await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Expires: settings.uploadExpiresSeconds,
        Conditions: [
          ['content-length-range', size, size],
          ['eq', '$Content-Type', mimeType],
          ['eq', '$x-amz-server-side-encryption', SSE],
          ['eq', '$x-amz-meta-response-id', responseId],
        ],
        Fields: {
          'Content-Type': mimeType,
          'x-amz-server-side-encryption': SSE,
          'x-amz-meta-response-id': responseId,
        },
      });
    } catch (err) {
      throw storageError(err, 'presign-post');
    }
    return { url: post.url, fields: post.fields, expiresAt: new Date(Date.now() + settings.uploadExpiresSeconds * 1000) };
  }

  // Copies pending/<x> to responses/<x>. `CopySourceIfMatch` makes S3 copy only if the object is still exactly the
  // version that was verified, so a swap between verification and copy cannot be promoted.
  // Returns { key, size, lastModified } of the final object, or { changed: true } if the source changed.
  async function promote(uploadKey, etag) {
    assertPending(uploadKey);
    const finalKey = finalKeyFor(uploadKey);
    try {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: finalKey,
          CopySource: `${bucket}/${uploadKey}`, // only safe characters (validated pattern): no encoding needed
          CopySourceIfMatch: etag,
          ServerSideEncryption: SSE,
          MetadataDirective: 'COPY',
        })
      );
    } catch (err) {
      if (isPreconditionFailed(err)) return { changed: true };
      throw storageError(err, 'copy');
    }
    const info = await head(finalKey);
    if (!info) throw new AppError(502, UNAVAILABLE_MESSAGE, 'STORAGE_UNAVAILABLE');
    return { key: finalKey, size: info.size, lastModified: info.lastModified };
  }

  async function deleteObject(key) {
    assertOwnKey(key);
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); // deleting a missing key succeeds
    } catch (err) {
      throw storageError(err, 'delete');
    }
  }

  // Used only by the local-to-S3 migration script.
  async function putFinalObject({ key, body, mimeType, size }) {
    assertFinal(key);
    try {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: mimeType, ContentLength: size, ServerSideEncryption: SSE })
      );
    } catch (err) {
      throw storageError(err, 'put');
    }
  }

  async function signGet(key, { disposition, mimeType, expiresIn }) {
    assertFinal(key);
    try {
      return await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: mimeType, ResponseContentDisposition: disposition }),
        { expiresIn }
      );
    } catch (err) {
      throw storageError(err, 'presign-get');
    }
  }

  const signPlaybackUrl = (key, mimeType) =>
    signGet(key, { disposition: 'inline', mimeType, expiresIn: settings.playbackExpiresSeconds });

  // `filename` is generated by the server (never taken from the client) and reduced to safe characters here.
  const signDownloadUrl = (key, mimeType, filename) =>
    signGet(key, {
      disposition: `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      mimeType,
      expiresIn: settings.downloadExpiresSeconds,
    });

  async function openVideo(key) {
    assertFinal(key);
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return result.Body;
    } catch (err) { throw storageError(err, 'read-video'); }
  }
  return { openVideo, head, readStart, createUploadAuthorization, promote, deleteObject, putFinalObject, signPlaybackUrl, signDownloadUrl };
}

let shared = null;

// Application-wide instance, created on first use so a server in local development mode never builds an S3 client.
function getS3Service() {
  if (!shared) {
    const { getS3Client } = require('../config/s3');
    shared = createS3Service({ client: getS3Client() });
  }
  return shared;
}

// Tests inject a service built on a fake client.
function setSharedS3Service(service) {
  shared = service;
}

module.exports = { createS3Service, getS3Service, setSharedS3Service, SSE };
