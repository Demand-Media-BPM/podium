const fs = require('fs');
const fsp = require('fs/promises');
const { Response } = require('../models');
const config = require('../config/env');
const { providerOf } = require('../utils/provider');
const videoStore = require('./videoStore');
const { newFinalKey } = require('./objectKeys');
const { sniffVideoFile } = require('./videoSniffer');

// Moves the development-only Phase 4 recordings (stored in a local folder) into S3, safely and in two separate,
// explicit steps. Nothing here runs automatically.
//
//   listLocalVideos()   read-only: which records are local, whether the file exists, how big it is
//   migrateOne()        copies ONE file to S3, verifies it there, and only then repoints the record
//   cleanupMigrated()   deletes the local copy of records that were migrated AND still verify in S3
//
// The local file is never deleted by the copy step. Records are only changed after the S3 copy was verified.

const DAY_MS = 24 * 60 * 60 * 1000;
const localRecords = () => ({ status: 'submitted', $or: [{ storageProvider: 'local' }, { storage: 'local', storageProvider: { $exists: false } }] });

async function listLocalVideos() {
  const docs = await Response.find(localRecords()).select('+videoKey +migratedFromLocalKey').sort({ createdAt: 1 });
  return Promise.all(
    docs.map(async (doc) => {
      const file = videoStore.resolveKey(doc.videoKey);
      let size = null;
      if (file) size = await fsp.stat(file).then((s) => s.size).catch(() => null);
      return { doc, file, size, present: size !== null };
    })
  );
}

// Copies one local recording to S3 and repoints its record. Returns { migrated, reason }.
async function migrateOne(item, s3) {
  const { doc, file, size } = item;
  if (!item.present || size > config.upload.maxBytes) return { migrated: false, reason: item.present ? 'too_large' : 'file_missing' };

  const detected = await sniffVideoFile(file);
  if (!detected) return { migrated: false, reason: 'unsupported_format' };

  const key = newFinalKey(String(doc.requestId), detected.mimeType);
  await s3.putFinalObject({ key, body: fs.createReadStream(file), mimeType: detected.mimeType, size });

  // Verify what is now in S3 before touching the record.
  const info = await s3.head(key);
  if (!info || info.size !== size) {
    await s3.deleteObject(key).catch(() => {});
    return { migrated: false, reason: 'verification_failed' };
  }

  const deleteAt = new Date(info.lastModified.getTime() + config.upload.retentionDays * DAY_MS);
  const result = await Response.updateOne(
    { _id: doc._id, status: 'submitted', videoKey: doc.videoKey }, // unchanged since it was listed
    { $set: { storageProvider: 's3', videoKey: key, mimeType: detected.mimeType, fileSize: size, deleteAt, migratedFromLocalKey: doc.videoKey } }
  );
  if (result.modifiedCount !== 1) {
    await s3.deleteObject(key).catch(() => {});
    return { migrated: false, reason: 'record_changed' };
  }
  return { migrated: true, key };
}

// Records that were migrated and still have their local file. Each is re-verified in S3 before its local file goes.
async function cleanupMigrated(s3) {
  const docs = await Response.find({ storageProvider: 's3', migratedFromLocalKey: { $exists: true } }).select('+videoKey +migratedFromLocalKey');
  const results = { deleted: 0, skipped: 0 };
  for (const doc of docs) {
    const local = videoStore.resolveKey(doc.migratedFromLocalKey);
    if (!local || !fs.existsSync(local)) continue;
    const info = await s3.head(doc.videoKey);
    if (!info || info.size !== doc.fileSize) {
      results.skipped += 1; // the S3 copy cannot be confirmed: keep the local file
      continue;
    }
    await videoStore.removeKey(doc.migratedFromLocalKey);
    results.deleted += 1;
  }
  return results;
}

module.exports = { listLocalVideos, migrateOne, cleanupMigrated, localRecords, providerOf };
