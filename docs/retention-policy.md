# 60-day video retention

The application and the supplied S3 lifecycle template now use 60 days for submitted videos under responses/. The live AWS rule shown for this project already uses 60 days; no AWS settings are changed by this code update. Pending upload lifecycle rules remain at one day, and signed playback/download URLs remain valid for 60 seconds.

New video responses record both deleteAt and the applied retentionDays (60). Local-to-S3 migration anchors a new 60-day deadline to the verified S3 copy creation time.

Existing response documents from the previous application have no retentionDays marker and their deleteAt was calculated with 180 days. On backend startup, an idempotent metadata update subtracts 120 days from those saved deadlines and records retentionDays=60. The original S3 storage clock is preserved, including recordings migrated from local storage. It does not start a new retention period from deployment time. Records without deleteAt use submittedAt + 60 days. Already shorter, explicitly marked retention policies are not extended.

The same alignment runs before scheduled/manual retention cleanup. Access checks and API serialization calculate the corrected deadline even before the metadata update. This keeps displayed expiry dates, single-video playback/download, local playback, ZIP eligibility and ZIP downloads consistent. Due objects are removed by the existing cleanup job (or S3 lifecycle), while MongoDB submission history is retained.

Restart/redeploy the backend and rebuild/redeploy the frontend to apply the change. The metadata correction runs on startup even with RETENTION_JOB=off; actual application cleanup still follows the configured schedule or npm run retention. No real database or AWS object is edited during isolated tests.
