const mongoose = require('mongoose');

// A tiny lease used so that only one server instance runs a scheduled job at a time (see services/jobLock.js).
// One document per job name. `lockedUntil` is the lease expiry, so a crashed instance cannot hold the lock forever.
const jobLockSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
    owner: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobLock', jobLockSchema);
