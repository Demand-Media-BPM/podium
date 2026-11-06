const { Response } = require('../models');
const config = require('../config/env');
const { providerOf } = require('../utils/provider');
const { isFinalKey, isPendingKey } = require('./objectKeys');
const { acquireLock, releaseLock } = require('./jobLock');
const videoStore = require('./videoStore');
const { alignStoredRetention } = require('./retentionPolicy');

// Keeps MongoDB in step with S3's lifecycle rules. S3 deletes the objects (asynchronously, so possibly a day or more
// after the deadline); this job makes the records say so and removes the storage references.
//
//   1. submitted responses whose deleteAt has passed  -> status 'expired', expiredAt set, videoKey cleared,
//      and (best effort) the S3 object deleted right away instead of waiting for the lifecycle rule.
//   2. pending uploads nobody completed within a day  -> status 'failed' (reason 'abandoned'), credentials cleared.
//
// Only minimal history is kept (name, email, dates, size). The job is idempotent: every update is conditional on the
// current status, so running it twice, or from two instances, changes nothing the second time.
// It never deletes MongoDB records - there is deliberately no TTL index.

const JOB_NAME = 'retention-cleanup';
const BATCH_SIZE = 100;
const LOCK_TTL_MS = 10 * 60 * 1000;
const FAILED_PENDING_AGE_MS = () => config.s3.pendingMaxAgeMs;

// Deletes a stored video object for a record. Returns true when the object is gone (or never existed).
async function removeStoredVideo(doc, s3) {
  const provider = providerOf(doc);
  try {
    if (provider === 's3' && isFinalKey(doc.videoKey)) await s3.deleteObject(doc.videoKey);
    else if (provider === 'local' && doc.videoKey) await videoStore.removeKey(doc.videoKey);
    return true;
  } catch {
    return false; // logged by the storage layer without sensitive details; the lifecycle rule is the backstop
  }
}

async function expireDueResponses({ s3, now }) {
  await alignStoredRetention();
  let expired = 0;
  let objectsLeft = 0;
  for (;;) {
    const due = await Response.find({ status: 'submitted', deleteAt: { $lte: now } })
      .select('+videoKey')
      .limit(BATCH_SIZE);
    if (due.length === 0) break;

    for (const doc of due) {
      const deleted = await removeStoredVideo(doc, s3);
      if (!deleted) objectsLeft += 1;
      // Conditional on the current status, so a concurrent run cannot expire the same record twice.
      const result = await Response.updateOne(
        { _id: doc._id, status: 'submitted' },
        { $set: { status: 'expired', expiredAt: now }, $unset: { videoKey: 1, uploadTokenHash: 1 } }
      );
      if (result.modifiedCount === 1) expired += 1;
    }
    if (due.length < BATCH_SIZE) break;
  }
  return { expired, objectsLeft };
}

async function failAbandonedUploads({ s3, now }) {
  const cutoff = new Date(now.getTime() - FAILED_PENDING_AGE_MS());
  let failed = 0;
  for (;;) {
    const stale = await Response.find({ status: 'pending_upload', createdAt: { $lte: cutoff } })
      .select('+uploadKey')
      .limit(BATCH_SIZE);
    if (stale.length === 0) break;

    for (const doc of stale) {
      if (isPendingKey(doc.uploadKey)) await s3.deleteObject(doc.uploadKey).catch(() => {});
      const result = await Response.updateOne(
        { _id: doc._id, status: 'pending_upload' },
        {
          $set: { status: 'failed', failureReason: 'abandoned' },
          $unset: { uploadKey: 1, uploadTokenHash: 1, uploadIssuedAt: 1 },
        }
      );
      if (result.modifiedCount === 1) failed += 1;
    }
    if (stale.length < BATCH_SIZE) break;
  }
  return { abandoned: failed };
}

// Runs one pass. `s3` may be null only when there is nothing to delete remotely (local development mode).
async function runRetentionCleanup({ s3, now = new Date(), lock = true } = {}) {
  if (lock && !(await acquireLock(JOB_NAME, LOCK_TTL_MS, now))) return { skipped: true, reason: 'locked' };
  try {
    const noS3 = { deleteObject: async () => {} };
    const store = s3 || noS3;
    const a = await expireDueResponses({ s3: store, now });
    const b = await failAbandonedUploads({ s3: store, now });
    return { skipped: false, ...a, ...b };
  } finally {
    if (lock) await releaseLock(JOB_NAME).catch(() => {});
  }
}

// Starts the in-process schedule (every 6 hours; first run one minute after start-up so a restart never skips a
// day). Safe with several instances because of the MongoDB lock. Errors are logged without client data.
function startRetentionSchedule({ getS3, settings = config.retention, run = runRetentionCleanup } = {}) {
  if (!settings.jobEnabled) {
    console.log('Retention job disabled (RETENTION_JOB=off). Run "npm run retention" from a scheduler instead.');
    return { stop() {} };
  }

  const tick = async () => {
    try {
      const result = await run({ s3: getS3 ? getS3() : null });
      if (!result.skipped && (result.expired || result.abandoned)) {
        console.log(`Retention job: expired ${result.expired}, abandoned ${result.abandoned}`);
      }
      if (result.objectsLeft) console.warn(`Retention job: ${result.objectsLeft} video object(s) could not be deleted now; S3 lifecycle will remove them`);
    } catch (err) {
      console.error(`Retention job failed (${err?.name || 'Error'})`);
    }
  };

  const first = setTimeout(tick, settings.initialDelayMs);
  const repeat = setInterval(tick, settings.intervalMs);
  first.unref();
  repeat.unref();
  return {
    stop() {
      clearTimeout(first);
      clearInterval(repeat);
    },
    tick,
  };
}

module.exports = { runRetentionCleanup, startRetentionSchedule, expireDueResponses, failAbandonedUploads, JOB_NAME };
