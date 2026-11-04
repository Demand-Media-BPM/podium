const { rateLimit } = require('express-rate-limit');

// Brute-force protection for POST /api/auth/login (per client IP).
// Successful logins do not count against the limit.
// Behind a reverse proxy, set TRUST_PROXY so the real client IP is used (see README).
function createLoginRateLimiter({ windowMs = 15 * 60 * 1000, limit = 10 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again later.',
        code: 'RATE_LIMITED',
      });
    },
  });
}

// Limits the unauthenticated GET /api/public/:token endpoint (per client IP).
// Tokens carry 256 bits of randomness so guessing is infeasible; this mainly stops abuse and scraping.
function createPublicRateLimiter({ windowMs = 15 * 60 * 1000, limit = 120 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
      });
    },
  });
}

// Stricter limit for POST /api/public/:token/responses (per client IP). Each upload can be up to 100 MB,
// so this protects disk space and bandwidth. A real client needs only a handful of attempts.
function createUploadRateLimiter({ windowMs = 60 * 60 * 1000, limit = 120 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many upload attempts. Please try again later.',
        code: 'RATE_LIMITED',
      });
    },
  });
}

module.exports = { createLoginRateLimiter, createPublicRateLimiter, createUploadRateLimiter };
