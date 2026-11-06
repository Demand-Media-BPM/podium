const { Response, Submission } = require('../models');

// Never includes tokenHash. `createdBy` is returned as { id, name } when populated.
function serializeRequest(doc, responseCount = 0, now = new Date()) {
  const expired = Boolean(doc.expiresAt) && doc.expiresAt <= now;
  // An unpopulated ObjectId also has an `_id` getter, so ask Mongoose whether the path was populated.
  const owner = doc.populated('createdBy') && doc.createdBy ? doc.createdBy : null;
  return {
    id: doc.id,
    title: doc.title,
    question: doc.question,
    questions: require('./questionnaire').questionsOf(doc),
    clientName: doc.clientName || '',
    microsite: doc.microsite || null,
    status: doc.status,
    // 'expired' takes precedence for display; `status` stays the stored value.
    effectiveStatus: doc.status === 'closed' ? 'closed' : expired ? 'expired' : 'active',
    maxDurationSeconds: doc.maxDurationSeconds,
    expiresAt: doc.expiresAt || null,
    linkIssuedAt: doc.tokenIssuedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: owner ? { id: String(owner._id), name: owner.name } : { id: String(doc.createdBy) },
    responseCount,
  };
}

// Counts received responses per request id: submitted ones plus those whose video has since expired (the record is
// kept as submission history, so the count does not shrink after 60 days). Returns a Map(requestId -> count).
async function countSubmittedResponses(requestIds) {
  if (requestIds.length === 0) return new Map();
  const groups = await Submission.aggregate([{ $match: {requestId: {$in: requestIds}} }, {$group: {_id: '$requestId', count: {$sum: 1}}}]);
  const rows = await Response.aggregate([
    { $match: { requestId: { $in: requestIds }, status: { $in: ['submitted', 'expired'] }, batchId: {$exists: false} } },
    { $group: { _id: '$requestId', count: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map(row => [String(row._id), row.count]));
  groups.forEach(row => counts.set(String(row._id), (counts.get(String(row._id)) || 0) + row.count));
  return counts;
}

module.exports = { serializeRequest, countSubmittedResponses };
