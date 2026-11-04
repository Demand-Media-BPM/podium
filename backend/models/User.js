const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    // Argon2id hash. Excluded from queries unless explicitly requested with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'employee'], default: 'employee' },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      // Defense in depth: never serialize the hash, even if it was selected.
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Emails are stored lowercase, so a plain unique index gives case-insensitive uniqueness.
userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
