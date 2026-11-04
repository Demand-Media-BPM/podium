const mongoose = require('mongoose');

// One immutable, completed questionnaire. Answer uploads are not visible before this record exists.
const schema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  batchId: { type: String, required: true },
  tokenHash: { type: String, required: true, select: false },
  responseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Response' }],
}, { timestamps: true });
schema.index({ requestId: 1, batchId: 1 }, { unique: true });
module.exports = mongoose.model('Submission', schema);
