const User = require('../models/User');
const AppError = require('../utils/AppError');
const { assertDbReady } = require('../config/db');
const { verifyPassword, verifyAgainstDummyHash, MAX_PASSWORD_LENGTH } = require('../services/passwordService');
const { signSessionToken } = require('../services/tokenService');
const { normalizeEmail, isValidEmail } = require('../services/userService');
const { setSessionCookie, clearSessionCookie } = require('../utils/cookies');

// One message for every credential failure (unknown email, wrong password, inactive account).
const INVALID_CREDENTIALS = 'Invalid email or password';

function toSafeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    throw new AppError(400, 'Email and password are required', 'VALIDATION_ERROR');
  }
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail) || password.length > MAX_PASSWORD_LENGTH) {
    // Same response as a failed login so malformed input leaks nothing.
    throw new AppError(401, INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
  }

  assertDbReady();
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  if (!user) {
    await verifyAgainstDummyHash(password);
    throw new AppError(401, INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await verifyPassword(user.passwordHash, password);
  // Checked after the password so deactivated accounts reveal nothing without the right password.
  if (!passwordMatches || !user.isActive) {
    throw new AppError(401, INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
  }

  setSessionCookie(res, signSessionToken(user.id));
  res.status(200).json({ success: true, user: toSafeUser(user) });
};

// GET /api/auth/me  (behind requireAuth, which already verified the cookie and loaded the user)
const me = (req, res) => {
  res.status(200).json({ success: true, user: req.user });
};

// POST /api/auth/logout
// Works with or without a valid session, so an expired session can still be cleared.
// JWTs are stateless: this removes the cookie from the browser but does not revoke a token
// that was copied elsewhere (it still expires within 8 hours). See README.
const logout = (req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ success: true, message: 'Logged out' });
};

module.exports = { login, me, logout };
