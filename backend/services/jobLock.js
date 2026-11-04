const crypto = require('crypto');
const { JobLock } = require('../models');

// A lease stored in MongoDB so that, with several server instances running, only one runs a scheduled job at a time.
// No Redis or extra infrastructure: MongoDB's atomic upsert is the lock. The lease expires by itself, so an instance
// that crashes while holding it cannot block the job forever.

const INSTANCE_ID = crypto.randomUUID();

// Returns true if this instance now holds the lease for `name` for `ttlMs`.
async function acquireLock(name, ttlMs, now = new Date()) {
  try {
    // Matches only when there is no lock yet, or the existing lease has run out. Otherwise the upsert tries to
    // insert a second document with the same _id and fails with a duplicate-key error: the lock is held elsewhere.
    const result = await JobLock.findOneAndUpdate(
      { _id: name, lockedUntil: { $lte: now } },
      { $set: { lockedUntil: new Date(now.getTime() + ttlMs), owner: INSTANCE_ID } },
      { upsert: true, returnDocument: 'after' }
    );
    return Boolean(result) && result.owner === INSTANCE_ID;
  } catch (err) {
    if (err && err.code === 11000) return false;
    throw err;
  }
}

// Gives the lease back early (after a run finishes) so the next run is not delayed. Only the owner can release it.
async function releaseLock(name) {
  await JobLock.updateOne({ _id: name, owner: INSTANCE_ID }, { $set: { lockedUntil: new Date(0) } });
}

module.exports = { acquireLock, releaseLock, INSTANCE_ID };
