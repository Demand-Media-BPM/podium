// Which storage a response's video lives in. Phase 5 records carry `storageProvider`; Phase 4 development records
// were saved with `storage: 'local'` instead, so both fields are read. Returns 's3', 'local' or null.
function providerOf(doc) {
  if (!doc) return null;
  return doc.storageProvider || doc.storage || null;
}

module.exports = { providerOf };
