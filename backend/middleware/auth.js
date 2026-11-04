const mongoose = require('mongoose');
const config = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { assertDbReady } = require('../config/db');
const { verifySessionToken } = require('../services/tokenService');
const { isAdmin } = require('../utils/access');

const UNAUTHENTICATED = () => new AppError(401, 'Authentication required', 'UNAUTHENTICATED');

// Validates the session cookie, loads the user from MongoDB and attaches a safe profile
// to req.user. Every failure mode (no cookie, bad/expired token, unknown or inactive user)
// returns the same 401 so callers learn nothing about why.
async function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[config.session.cookieName];
  if (!token || typeof token !== 'string') {
    throw UNAUTHENTICATED();
  }

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    throw UNAUTHENTICATED();
  }

  if (!payload.sub || !mongoose.isValidObjectId(payload.sub)) {
    throw UNAUTHENTICATED();
  }

  assertDbReady();
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw UNAUTHENTICATED();
  }

  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
}

// Use after requireAuth. Admins pass every role check ("broader access").
// Example: router.get('/users', requireAuth, requireRole('admin'), handler)
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      throw UNAUTHENTICATED();
    }
    if (isAdmin(req.user) || allowedRoles.includes(req.user.role)) {
      return next();
    }
    throw new AppError(403, 'You do not have permission to perform this action', 'FORBIDDEN');
  };
}

module.exports = { requireAuth, requireRole };
