const config = require('../config/env');
const DAY_MS = 24 * 60 * 60 * 1000;
// Records created before this change used 180 days and did not store the policy version.
const LEGACY_RETENTION_DAYS = 180;

function retentionDeadline(doc) {
  if (doc.deleteAt) {
    const appliedDays = doc.retentionDays ?? LEGACY_RETENTION_DAYS;
    const reduction = Math.max(0, appliedDays - config.upload.retentionDays) * DAY_MS;
    // Preserve the original storage clock (including migrated videos), never restart retention from today.
    return new Date(new Date(doc.deleteAt).getTime() - reduction);
  }
  if (doc.submittedAt) return new Date(new Date(doc.submittedAt).getTime() + config.upload.retentionDays * DAY_MS);
  return null;
}

// An atomic conditional update makes this safe to run at every startup, job pass, or on multiple instances.
// It changes deadline metadata only; the normal retention job handles due video objects afterwards.
async function alignStoredRetention() {
  const { Response } = require('../models');
  const currentDays = config.upload.retentionDays;
  const eligible = {status: {$in: ['submitted', 'expired']}, $or: [{retentionDays: null}, {retentionDays: {$gt: currentDays}}]};
  const withDeadline = await Response.updateMany(
    {...eligible, deleteAt: {$type: 'date'}},
    [{$set: {
      deleteAt: {$subtract: ['$deleteAt', {$multiply: [{$max: [0, {$subtract: [{$ifNull: ['$retentionDays', LEGACY_RETENTION_DAYS]}, currentDays]}]}, DAY_MS]}]},
      retentionDays: currentDays,
    }}],
    {updatePipeline: true}
  );
  const withoutDeadline = await Response.updateMany(
    {...eligible, deleteAt: null, submittedAt: {$type: 'date'}},
    [{$set: {deleteAt: {$add: ['$submittedAt', currentDays * DAY_MS]}, retentionDays: currentDays}}],
    {updatePipeline: true}
  );
  return withDeadline.modifiedCount + withoutDeadline.modifiedCount;
}
module.exports = {retentionDeadline, alignStoredRetention};
