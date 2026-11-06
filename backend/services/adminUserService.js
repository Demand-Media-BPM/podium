const { User } = require('../models');
const AppError = require('../utils/AppError');
const { assertValidId } = require('../utils/ids');
const { cleanText, assertPlainObject, assertOnlyAllowedFields, throwIfErrors } = require('./fieldValidators');
const { createUser, normalizeEmail, isValidEmail } = require('./userService');
const { getPasswordPolicyError } = require('./passwordService');

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

function validateUserInput(body, { partial = false } = {}) {
  assertPlainObject(body);
  assertOnlyAllowedFields(body, partial ? ['name', 'email', 'role', 'isActive'] : ['name', 'email', 'role', 'password']);
  const data = {}, errors = {};
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? cleanText(body.name, { singleLine: true }) : '';
    if (!name || name.length > 100) errors.name = 'Enter a name of up to 100 characters';
    else data.name = name;
  }
  if (!partial || body.email !== undefined) {
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) errors.email = 'Enter a valid email address';
    else data.email = email;
  }
  if (!partial || body.role !== undefined) {
    const role = body.role === undefined ? 'employee' : body.role;
    if (!['admin', 'employee'].includes(role)) errors.role = 'Select Admin or User';
    else data.role = role;
  }
  if (!partial) {
    const error = getPasswordPolicyError(body.password);
    if (error) errors.password = error;
    else data.password = body.password;
  }
  if (partial && body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') errors.isActive = 'Status must be active or inactive';
    else data.isActive = body.isActive;
  }
  throwIfErrors(errors);
  if (!Object.keys(data).length) throw new AppError(400, 'No changes were supplied', 'VALIDATION_ERROR');
  return data;
}

function duplicateEmail(err) {
  if (err.code === 11000 || err.statusCode === 409) {
    throw new AppError(409, 'An account with this email already exists', 'EMAIL_IN_USE', {email: 'An account with this email already exists'});
  }
  throw err;
}

async function listUsers({page, limit}) {
  const [total, docs] = await Promise.all([
    User.countDocuments({}),
    User.find({}).sort({createdAt: -1, _id: -1}).skip((page - 1) * limit).limit(limit),
  ]);
  return {users: docs.map(safeUser), pagination: {page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit))}};
}

async function addUser(body) {
  const data = validateUserInput(body);
  try {
    const created = await createUser(data);
    return safeUser(await User.findById(created.id));
  } catch (err) { duplicateEmail(err); }
}

async function updateUser(actor, id, body) {
  assertValidId(id, 'user id');
  const changes = validateUserInput(body, {partial: true});
  if (String(actor.id) === String(id) && (changes.role === 'employee' || changes.isActive === false)) {
    throw new AppError(409, 'You cannot remove your own admin role or deactivate your own account', 'SELF_ACCESS_CHANGE');
  }
  try {
    const user = await User.findByIdAndUpdate(id, {$set: changes}, {returnDocument: 'after', runValidators: true});
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    return safeUser(user);
  } catch (err) { duplicateEmail(err); }
}

module.exports = { listUsers, addUser, updateUser, validateUserInput };
