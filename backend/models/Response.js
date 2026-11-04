const mongoose = require('mongoose');

// A client's video answer. The video lives in a private AWS S3 bucket; MongoDB only stores the object key and
// metadata (never the video, never a presigned URL).
//
// Lifecycle:  pending_upload --(S3 object verified)--> submitted --(retention deadline)--> expired
//                  \--(invalid upload / abandoned)--> failed
// Every transition is a conditional update on the current status, so concurrent requests cannot create
// duplicate or inconsistent records.
//
// storageProvider: 's3' for Phase 5 submissions, 'local' for the development-only Phase 4 test recordings.
// Phase 4 documents were saved with the field `storage` instead; it is kept (read-only) so they still load, and
// utils/provider.js providerOf() reads either.
const responseSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
    batchId: { type: String },
    batchTokenHash: { type: String, select: false },
    questionId: { type: String },
    questionText: { type: String, maxlength: 2000 },
    // Client-generated UUID that makes a retried submission idempotent (unique per request, see index below).
    submissionId: {
      type: String,
      trim: true,
      lowercase: true,
      match: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    },
    clientName: { type: String, trim: true, maxlength: 100 },
    clientEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    // Hidden by default so a query can never leak it by accident; opt in with .select('+videoKey').
    // The final object key (s3: responses/<requestId>/<uuid>.<ext>; local: key inside UPLOAD_DIR).
    videoKey: { type: String, trim: true, select: false },
    storageProvider: { type: String, enum: ['local', 's3'] },
    storage: { type: String, enum: ['local', 's3'] }, // legacy Phase 4 name, read-only
    // Set by the migration script: the old local key, so the local file can be cleaned up after verification.
    migratedFromLocalKey: { type: String, trim: true, select: false },
    // Phase 5 upload handshake (hidden from queries):
    uploadKey: { type: String, trim: true, select: false }, // pending/<requestId>/<uuid>.<ext> the browser uploads to
    uploadTokenHash: { type: String, select: false }, // SHA-256 of the completion credential given to that client
    uploadIssuedAt: { type: Date }, // when the current upload authorization was issued
    mimeType: { type: String, trim: true },
    fileSize: { type: Number, min: 0 },
    durationSeconds: { type: Number, min: 0 },
    consentAccepted: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending_upload', 'submitted', 'expired', 'failed'],
      default: 'pending_upload',
    },
    submittedAt: { type: Date },
    // Retention deadline: the S3 object's creation time + 180 days, set exactly once when the upload is verified
    // (never updated afterwards: the update that sets it only matches records that do not have it yet).
    // The app refuses playback/download from this moment on, whether or not S3 has physically deleted the object.
    // It is a plain date, intentionally NOT a TTL index: the record is kept as minimal submission history.
    deleteAt: { type: Date },
    expiredAt: { type: Date }, // when the retention job marked the record expired
    failureReason: { type: String, trim: true, maxlength: 60 }, // short code, e.g. unsupported_video, abandoned
  },
  { timestamps: true }
);

responseSchema.index({ requestId: 1, createdAt: -1 });
// A retried upload carries the same submissionId, so a second record for it can never be created.
responseSchema.index(
  { requestId: 1, submissionId: 1 },
  { unique: true, partialFilterExpression: { submissionId: { $type: 'string' } } }
);
// Lets the retention job find submitted videos that are due to expire.
responseSchema.index({ status: 1, deleteAt: 1 });
// Lets the cleanup job find abandoned pending uploads.
responseSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('Response', responseSchema);
