const argon2 = require('argon2');

const MIN_PASSWORD_LENGTH = 12;
// Upper bound stops absurdly long inputs from being used to burn CPU/memory in the hasher.
const MAX_PASSWORD_LENGTH = 128;

// Argon2id with explicit parameters (64 MiB memory, 3 passes), above the OWASP minimums.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

// Returns true/false and never throws for malformed hashes.
async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHashPromise = null;

// Used when the email does not exist, so "unknown user" and "wrong password" take similar time.
async function verifyAgainstDummyHash(password) {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword('dummy-password-for-timing-equalization');
  }
  await verifyPassword(await dummyHashPromise, password);
}

// Returns an error message, or null when the password is acceptable.
function getPasswordPolicyError(password) {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters long`;
  }
  return null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  verifyAgainstDummyHash,
  getPasswordPolicyError,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
};
