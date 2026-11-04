const config = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
require('./models'); // register models so their indexes are created on connect
const createApp = require('./app');
const videoStore = require('./services/videoStore');
const { startRetentionSchedule } = require('./services/retentionService');
const { getS3Service } = require('./services/s3Service');

async function start() {
  // 1. Fail fast on missing/invalid configuration (names only, never values).
  config.validateEnv();

  // 2. Connect to MongoDB Atlas BEFORE the API starts accepting requests.
  await connectDB();

  // 3. Storage. S3 is the default and the only option in production. Local storage is a development convenience:
  //    prepare its folder and drop partial uploads left by a crash.
  if (config.storage.provider === 'local') {
    console.warn('STORAGE_PROVIDER=local: videos are stored on this machine. Development only - never use in production.');
    videoStore.ensureDirsSync();
    const staleRemoved = await videoStore.removeStaleTemp();
    if (staleRemoved > 0) console.log(`Removed ${staleRemoved} stale partial upload(s)`);
  } else {
    console.log(`Video storage: S3 bucket "${config.s3.bucket}" in ${config.s3.region}`);
  }

  // 4. Start the HTTP server.
  const server = createApp().listen(config.port, () => {
    console.log(`Video Response API listening on port ${config.port} (${config.nodeEnv})`);
  });

  // 5. Scheduled retention job (expires records past their 180-day deadline). Uses a MongoDB lock, so running
  //    several instances is safe.
  const retention = startRetentionSchedule({
    getS3: () => (config.storage.provider === 's3' ? getS3Service() : null),
  });

  server.on('error', async (err) => {
    console.error(`Server error: ${err.message}`);
    await disconnectDB().catch(() => {});
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    retention.stop();
    server.close(async () => {
      await disconnectDB().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error(`Startup failed: ${err.message}`);
  process.exit(1);
});
