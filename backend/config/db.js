const mongoose = require('mongoose');
const config = require('./env');
const AppError = require('../utils/AppError');

let listenersRegistered = false;

// Removes "user:password@" from any connection string that appears in a message.
function redactUri(text) {
  return String(text).replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]*@/gi, '$1<redacted>@');
}

function registerConnectionLogging() {
  if (listenersRegistered) return;
  listenersRegistered = true;
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => console.error(`MongoDB error (${err.name})`));
}

// Connects to MongoDB Atlas. Rejects (with a credential-free message) if the connection fails.
// Models must be loaded before calling this so their indexes are built before the API serves traffic.
async function connectDB({
  uri = config.mongodbUri,
  dbName = config.mongodbDbName,
  serverSelectionTimeoutMS = 10000,
} = {}) {
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add your MongoDB Atlas connection string to backend/.env.');
  }

  registerConnectionLogging();

  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS });
  } catch (err) {
    throw new Error(`MongoDB connection failed (${err.name}): ${redactUri(err.message)}`);
  }

  try {
    // Make sure unique indexes exist before accepting requests.
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  } catch (err) {
    await mongoose.disconnect().catch(() => {});
    throw new Error(`MongoDB index setup failed (${err.name}): ${redactUri(err.message)}`);
  }

  console.log(`MongoDB connected (database: ${dbName})`);
}

async function disconnectDB() {
  await mongoose.disconnect();
}

// readyState 1 === connected
function isDbReady() {
  return mongoose.connection.readyState === 1;
}

// Use inside database-dependent handlers so a dropped connection yields a clean 503.
function assertDbReady() {
  if (!isDbReady()) {
    throw new AppError(503, 'Service temporarily unavailable', 'DB_UNAVAILABLE');
  }
}

module.exports = { connectDB, disconnectDB, isDbReady, assertDbReady, redactUri };
