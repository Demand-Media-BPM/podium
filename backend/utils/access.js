// Ownership helpers for future request/response routes (Phase 3+).
// Rule: admins can access everything; employees can only access resources they created.

function isAdmin(user) {
  return Boolean(user) && user.role === 'admin';
}

// Mongo filter to merge into queries, e.g. Request.find({ ...ownerFilter(req.user) }).
function ownerFilter(user, field = 'createdBy') {
  return isAdmin(user) ? {} : { [field]: user.id };
}

// Check for a single loaded document's owner id (ObjectId or string).
function canAccessOwnedResource(user, ownerId) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return ownerId != null && String(ownerId) === String(user.id);
}

module.exports = { isAdmin, ownerFilter, canAccessOwnedResource };
