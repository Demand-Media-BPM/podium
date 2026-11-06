const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Response } = require('../../models');
const videoStore = require('../../services/videoStore');

// Creates a Phase 4 style record: a file in the local upload folder plus a response saved with the OLD
// `storage: 'local'` field (and no `storageProvider`), inserted through the raw collection like old data would be.
async function legacyRecord(requestId, bytes) {
  videoStore.ensureDirsSync();
  const key = videoStore.buildKey(requestId, 'webm');
  const temp = `${videoStore.tempDir}/${videoStore.newTempName()}`;
  fs.writeFileSync(temp, bytes);
  await videoStore.commit(temp, key);
  const doc = await Response.collection.insertOne({
    requestId: new mongoose.Types.ObjectId(requestId),
    submissionId: crypto.randomUUID(),
    clientName: 'Legacy Client',
    clientEmail: 'legacy@example.com',
    videoKey: key,
    storage: 'local',
    mimeType: 'video/webm',
    fileSize: bytes.length,
    durationSeconds: 10,
    consentAccepted: true,
    status: 'submitted',
    submittedAt: new Date(),
    deleteAt: new Date(Date.now() + 180 * 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id: doc.insertedId, key };
}

module.exports = { legacyRecord };
