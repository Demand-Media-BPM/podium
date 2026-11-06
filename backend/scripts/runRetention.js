// Runs the retention cleanup once, from the command line:
//   npm run retention
//
// What it does (the same pass the server runs every 6 hours):
//   - marks submitted responses past their 60-day deadline as 'expired' and deletes their S3 object,
//   - marks pending uploads that were never completed as 'failed'.
// It never deletes database records. It is safe to run at any time and as often as you like. Use it from a scheduler
// (cron / systemd timer) if you start the server with RETENTION_JOB=off.

const config = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
require('../models');
const { runRetentionCleanup } = require('../services/retentionService');
const { getS3Service } = require('../services/s3Service');

(async () => {
  config.validateEnv(['MONGODB_URI', 'STORAGE']);
  await connectDB();
  const s3 = config.storage.provider === 's3' ? getS3Service() : null;
  const result = await runRetentionCleanup({ s3 });
  if (result.skipped) console.log('Another instance is already running the cleanup. Nothing done.');
  else console.log(`Retention cleanup finished: expired ${result.expired}, abandoned ${result.abandoned}, objects left for S3 lifecycle ${result.objectsLeft}`);
  await disconnectDB();
})().catch(async (err) => {
  console.error(`Retention cleanup failed: ${err.message}`);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
