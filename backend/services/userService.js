const User = require('../models/User');
const AppError = require('../utils/AppError');
const { hashPassword, getPasswordPolicyError } = require('./passwordService');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

// Creates an employee/admin account. Used by the admin CLI script now and by an
// authenticated admin-only feature in a later phase. There is no public registration.
async function createUser({ name, email, password, role = 'employee' }) {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = normalizeEmail(email);

  if (!cleanName || cleanName.length > MAX_NAME_LENGTH) {
    throw new AppError(400, `Name is required (max ${MAX_NAME_LENGTH} characters)`);
  }
  if (!isValidEmail(cleanEmail)) {
    throw new AppError(400, 'A valid email address is required');
  }
  const passwordError = getPasswordPolicyError(password);
  if (passwordError) {
    throw new AppError(400, passwordError);
  }
  if (!['admin', 'employee'].includes(role)) {
    throw new AppError(400, 'Role must be admin or employee');
  }

  if (await User.exists({ email: cleanEmail })) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await User.create({ name: cleanName, email: cleanEmail, passwordHash, role });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  } catch (err) {
    // Two concurrent creations can both pass the check above; the unique index is the real guard.
    if (err && err.code === 11000) {
      throw new AppError(409, 'An account with this email already exists');
    }
    throw err;
  }
}

module.exports = { createUser, normalizeEmail, isValidEmail };
