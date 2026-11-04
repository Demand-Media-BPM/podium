const { isDbReady } = require('../config/db');

const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Video Response API is running',
  });
};

// Readiness: 200 only when MongoDB is connected, otherwise 503.
// Kept separate from /api/health so the plain "is the API process up" check never depends on the database.
const getReadiness = (req, res) => {
  const ready = isDbReady();
  res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'Video Response API is ready' : 'Database is not connected',
    database: ready ? 'connected' : 'disconnected',
  });
};

module.exports = { getHealth, getReadiness };
