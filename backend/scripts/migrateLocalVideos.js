// Local test recordings (Phase 4) -> S3. Three explicit modes, none of which deletes anything by default:
//
//   npm run list-local-videos                    read-only report (default; changes nothing)
//   npm run migrate-local-videos                 copies the local files to S3 after you type MIGRATE.
//                                                Local files are KEPT.
//   node scripts/migrateLocalVideos.js --cleanup deletes the local copy of every migrated video that still verifies
//                                                in S3, after you type DELETE.
//
// Records are only changed after their S3 copy is verified. Run the report first.

const readline = require('readline');
const config = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
require('../models');
const { getS3Service } = require('../services/s3Service');
const { listLocalVideos, migrateOne, cleanupMigrated } = require('../services/localMigration');

const mb = (bytes) => (bytes == null ? 'missing' : `${(bytes / 1048576).toFixed(2)} MB`);

function confirm(word, question) {
  if (!process.stdin.isTTY) throw new Error(`This step needs an interactive terminal (you must type ${word}).`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${question}\nType ${word} to continue: `, (a) => { rl.close(); resolve(a.trim() === word); }));
}

(async () => {
  const apply = process.argv.includes('--apply');
  const cleanup = process.argv.includes('--cleanup');
  config.validateEnv(['MONGODB_URI']);
  await connectDB();

  if (cleanup) {
    if (config.storage.provider !== 's3') throw new Error('Set STORAGE_PROVIDER=s3 (with AWS settings) to clean up migrated videos.');
    const ok = await confirm('DELETE', 'This permanently deletes local video files whose S3 copy was migrated and re-verified just now.');
    if (!ok) return console.log('Cancelled. Nothing was deleted.');
    const r = await cleanupMigrated(getS3Service());
    return console.log(`Deleted ${r.deleted} local file(s). Kept ${r.skipped} because the S3 copy could not be confirmed.`);
  }

  const items = await listLocalVideos();
  console.log(`Local test recordings found: ${items.length}`);
  items.forEach(({ doc, size, present }, i) =>
    console.log(`  ${i + 1}. response ${doc.id}  request ${doc.requestId}  ${mb(size)}  file ${present ? 'present' : 'MISSING'}`)
  );
  if (!apply || items.length === 0) {
    if (!apply && items.length) console.log('\nRead-only report. Nothing was changed. To copy them to S3: npm run migrate-local-videos');
    return;
  }

  if (config.storage.provider !== 's3') throw new Error('Set STORAGE_PROVIDER=s3 (with AWS settings) before migrating.');
  const ok = await confirm('MIGRATE', `This copies ${items.length} local file(s) to S3 bucket "${config.s3.bucket}". Local files are kept.`);
  if (!ok) return console.log('Cancelled. Nothing was changed.');

  const s3 = getS3Service();
  let migrated = 0;
  for (const item of items) {
    const r = await migrateOne(item, s3);
    if (r.migrated) migrated += 1;
    console.log(`  response ${item.doc.id}: ${r.migrated ? 'migrated' : `skipped (${r.reason})`}`);
  }
  console.log(`\nMigrated ${migrated} of ${items.length}. Local files were kept. After checking the videos play, run: node scripts/migrateLocalVideos.js --cleanup`);
})()
  .catch((err) => {
    console.error(`Failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB().catch(() => {}));
