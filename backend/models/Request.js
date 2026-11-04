const mongoose = require('mongoose');

// A text question that employees send to clients through a unique link.
const requestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    question: { type: String, required: true, trim: true, maxlength: 2000 },
    clientName: { type: String, trim: true, maxlength: 100 },
    microsite: { type: String, enum: require('../services/questionnaire').MICROSITES },
    questions: { type: [new mongoose.Schema({ text: { type: String, required: true, maxlength: 2000 } })], default: undefined },
    // SHA-256 (hex) of the secret link token. The raw token is never stored, so the link cannot be
    // recovered later; regenerating the link replaces this hash and invalidates the old link.
    tokenHash: { type: String, select: false },
    // When the current link was generated (creation or last regeneration).
    tokenIssuedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    maxDurationSeconds: { type: Number, default: 3540, min: 1, max: 3540 },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

// Unique only when a token hash exists, so requests without one do not collide on "null".
requestSchema.index(
  { tokenHash: 1 },
  { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } }
);
// Employee dashboards list their own requests, newest first.
requestSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('Request', requestSchema);
