const { Request, Response, Submission, IssuedLink } = require('../models');
const AppError = require('../utils/AppError');
const { ownerFilter } = require('../utils/access');
const { assertValidId } = require('../utils/ids');
const { serializeRequest, countSubmittedResponses } = require('./requestSerializer');
const {
  generateToken,
  tokenCandidates,
  hashToken,
  isValidTokenFormat,
  buildPublicUrl,
  isDuplicateTokenError,
} = require('./linkTokenService');

const MAX_TOKEN_ATTEMPTS = 3;
const NOT_FOUND = () => new AppError(404, 'Request not found', 'NOT_FOUND');
const LINK_UNAVAILABLE = () => new AppError(404, 'This link is not available', 'LINK_UNAVAILABLE');

// Not expired = no expiry set, or expiry in the future.
const notExpired = (now) => [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }];

// Inserts/updates with a fresh token, retrying in the (practically impossible) case of a hash collision.
async function withFreshToken(write, name, excludedHash) {
  const candidates = name === undefined ? Array.from({length: MAX_TOKEN_ATTEMPTS}, () => generateToken()) : tokenCandidates(name);
  for (const token of candidates) {
    if (hashToken(token) === excludedHash) continue;
    if (name !== undefined) {
      try { await IssuedLink.create({_id:hashToken(token)}); }
      catch (err) { if (err.code === 11000) continue; throw err; }
    }
    try {
      const result = await write(token, hashToken(token));
      return { token, result };
    } catch (err) {
      if (!isDuplicateTokenError(err)) throw err;
    }
  }
  throw new AppError(409, 'All 100 links for this client name are in use. Use a different client name.', 'LINK_SPACE_EXHAUSTED');
}

// The raw token is returned to the caller exactly once and is never stored.
async function createRequest(user, data) {
  const { token, result } = await withFreshToken((rawToken, tokenHash) =>
    Request.create({ ...data, maxDurationSeconds: data.questions ? 3540 : 120, createdBy: user.id, tokenHash, tokenIssuedAt: new Date() })
  , data.clientName);
  await result.populate('createdBy', 'name');
  return { request: serializeRequest(result, 0), url: buildPublicUrl(token) };
}

async function listRequests(user, { page, limit }) {
  const filter = ownerFilter(user);
  const [total, docs] = await Promise.all([
    Request.countDocuments(filter),
    Request.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name'),
  ]);
  const counts = await countSubmittedResponses(docs.map((doc) => doc._id));
  const now = new Date();
  return {
    requests: docs.map((doc) => serializeRequest(doc, counts.get(doc.id) || 0, now)),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function getSummary(user) {
  const filter = ownerFilter(user);
  const [totalRequests, activeRequests, requestIds] = await Promise.all([
    Request.countDocuments(filter),
    Request.countDocuments({ ...filter, status: 'active', $or: notExpired(new Date()) }),
    Request.find(filter).distinct('_id'),
  ]);
  const totalResponses = await Response.countDocuments({
    requestId: { $in: requestIds },
    status: { $in: ['submitted', 'expired'] },
    batchId: {$exists: false},
  });
  const grouped = await Submission.countDocuments({requestId: {$in: requestIds}});
  return { totalRequests, activeRequests, totalResponses: totalResponses + grouped };
}

// Owner (or admin) lookup. A request that exists but belongs to someone else is reported as 404 too,
// so ids cannot be probed to discover other employees' requests.
async function getRequest(user, id) {
  assertValidId(id, 'request id');
  const doc = await Request.findOne({ _id: id, ...ownerFilter(user) }).populate('createdBy', 'name');
  if (!doc) throw NOT_FOUND();
  const counts = await countSubmittedResponses([doc._id]);
  return serializeRequest(doc, counts.get(doc.id) || 0);
}

async function updateRequest(user, id, { set, unset }) {
  assertValidId(id, 'request id');
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;

  if (set.question && !set.questions) {
    const current = await Request.findOne({_id: id, ...ownerFilter(user)});
    if (current?.questions?.length) throw new AppError(400, 'Use the question list to edit this request', 'VALIDATION_ERROR');
  }
  const doc = await Request.findOneAndUpdate({ _id: id, ...ownerFilter(user) }, update, {
    returnDocument: 'after',
    runValidators: true,
  }).populate('createdBy', 'name');
  if (!doc) throw NOT_FOUND();

  const counts = await countSubmittedResponses([doc._id]);
  return serializeRequest(doc, counts.get(doc.id) || 0);
}

// One atomic findOneAndUpdate swaps the stored hash, so the old link stops working immediately and there
// is no moment where both are valid. The new raw token is returned once and never stored.
async function regenerateLink(user, id) {
  assertValidId(id, 'request id');
  const owned = await Request.findOne({_id:id,...ownerFilter(user)}).select('+tokenHash');
  if (!owned) throw NOT_FOUND();
  const { token, result } = await withFreshToken((rawToken, tokenHash) =>
    Request.findOneAndUpdate(
      { _id: id, ...ownerFilter(user) },
      { $set: { tokenHash, tokenIssuedAt: new Date() } },
      { returnDocument: 'after' }
    ).populate('createdBy', 'name')
  , owned.clientName, owned.tokenHash);
  if (!result) throw NOT_FOUND();

  const counts = await countSubmittedResponses([result._id]);
  return { request: serializeRequest(result, counts.get(result.id) || 0), url: buildPublicUrl(token) };
}

// Public lookup by raw token. Invalid format, unknown, closed and expired links all produce the same
// error, so a visitor cannot tell why a link does not work. Returns only what the client page needs.
async function getPublicRequest(token) {
  if (!isValidTokenFormat(token)) throw LINK_UNAVAILABLE();

  const doc = await Request.findOne({
    tokenHash: hashToken(token),
    status: 'active',
    $or: notExpired(new Date()),
  }).select('title question questions clientName microsite maxDurationSeconds');
  if (!doc) throw LINK_UNAVAILABLE();

  if (!doc.questions?.length) return {title:doc.title,question:doc.question,maxDurationSeconds:doc.maxDurationSeconds};
  return { title: doc.title, question: doc.question, questions: require('./questionnaire').questionsOf(doc), clientName: doc.clientName || '', microsite: doc.microsite || null, multiQuestion: Boolean(doc.questions?.length), maxDurationSeconds: doc.maxDurationSeconds };
}

// Request that currently accepts submissions for this raw token, or null (bad format, unknown, closed, expired).
// Used before an upload is read, and again right before it is saved.
async function findAcceptingRequest(token) {
  if (!isValidTokenFormat(token)) return null;
  return Request.findOne({ tokenHash: hashToken(token), status: 'active', $or: notExpired(new Date()) })
    .select('_id maxDurationSeconds questions')
    .lean();
}

// The request that owns this raw token regardless of status (so completing an upload can still confirm an
// already-saved response after the request was closed). Returns { _id, status, expiresAt } or null.
async function findRequestByToken(token) {
  if (!isValidTokenFormat(token)) return null;
  return Request.findOne({ tokenHash: hashToken(token) }).select('_id status expiresAt maxDurationSeconds questions').lean();
}

async function isRequestAccepting(requestId) {
  const found = await Request.exists({ _id: requestId, status: 'active', $or: notExpired(new Date()) });
  return Boolean(found);
}

module.exports = {
  findRequestByToken,
  findAcceptingRequest,
  isRequestAccepting,
  createRequest,
  listRequests,
  getSummary,
  getRequest,
  updateRequest,
  regenerateLink,
  getPublicRequest,
};
