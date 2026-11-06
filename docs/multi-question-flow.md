# Multi-question video responses

New requests include a client name, microsite and 1-30 ordered questions (up to 2,000 characters each). The browser records one video per question. The final retained answers share a 59-minute (3,540 second) allowance; reading/review time does not count, and replacing an answer restores its duration. Every question and consent are required before submission.

## Branding

Edit the individual configuration files in frontend/src/themes/microsites/:

| File | Primary | Secondary |
| --- | --- | --- |
| it-tech-pulse.js | #171810 | #07A8BA |
| fin-tech-pulse.js | #006642 | #FF9F1C |
| mar-tech-pulse.js | #F7C51E | #8D52FE |
| hr-tech-pulse.js | #F2FAFD | #228AE6 |
| health-tech-pulse.js | #083A52 | #2EC4B6 |

The public header, buttons, forms, question rows and thank-you journey use the chosen theme. Contrast colors are derived for readability. Employee pages retain their existing theme.

## Short links

A new link is the normalized client name (lowercase ASCII letters/digits, maximum 60 characters) plus exactly two random digits, including leading zeroes, for example /respond/saurabh07. Non-ASCII-only names use the prefix client. Generation tries the 100 suffixes in a randomized order, and MongoDB reserves the token hashes atomically. IssuedLink documents permanently reserve issued short links, including regenerated links, so a retired URL cannot point to another request. Exhaustion returns 409 LINK_SPACE_EXHAUSTED and asks for a different client name. Changing a client name does not change the existing link; Regenerate does. Long links for older requests continue to work.

Two digits are a small, predictable access space: these URLs are public access codes rather than high-entropy secrets. Existing IP rate limits still apply. Raw link tokens are not stored.

## Upload and final submission

Each answer uses the existing direct-to-S3 upload/verification flow (or local multipart flow in development). The per-video ceiling is now 2 GiB, allowing about 59 minutes at the recorder's target bitrate. Browser memory and device/browser support still constrain long recordings. Nothing uploads until Submit all answers is pressed; navigating away or refreshing loses recordings held in memory.

Answer metadata adds questionId, batchId (UUID), and batchToken (random 256-bit credential). Only its SHA-256 hash is saved. Each recording has its own submissionId and upload session, so retrying a partially uploaded questionnaire reuses already confirmed answers. Retaking a video clears its upload session and consent. The welcome form still collects name/email, prefilling the admin-entered client name.

POST /api/public/:token/submissions receives {batchId, batchToken, answers: [responseId, ...]}. It verifies:

- The link still accepts responses, unless confirming an already completed submission.
- Every current question has exactly one matching submitted video with the correct question text snapshot.
- All answers belong to that request and batch and match the batch credential, client details and consent.
- No answer has expired and the total reported duration is at most 3,540 seconds.

An immutable Submission record publishes the selected response IDs together. Before it exists, videos are excluded from employee lists, counts, playback and download. Extra attempts not selected for the final submission stay hidden. Counts on request/dashboard pages count complete questionnaires, and the response list paginates complete submissions (five per UI page), keeping all question videos together. Original single-question records retain their legacy flow.

Duration remains browser-reported, as in the original app; container signature validation does not decode or independently time videos. The existing 60-day video retention and private S3 settings remain in effect.

## Playback and ZIP download

Employees see the question text alongside each video and can play or download it individually. Download ZIP uses GET /api/requests/:id/submissions/:batchId/download, checks ownership/admin access and retention for every selected answer, and streams a ZIP without buffering the recordings in memory. It supports S3 and local development recordings. Filenames use question text sanitized to safe characters, with ordering and an ID suffix to prevent duplicate names. If a video has expired or is missing, the download returns an error instead of silently omitting it.

The ZIP streams through the backend. If deployed behind a reverse proxy, allow enough response time for large ZIP downloads. In local storage mode, the proxy body-size limit must also permit video uploads up to 2 GiB; direct S3 video uploads do not pass through the API proxy.

## Development and checks

Run npm install in backend and frontend after pulling these changes. Start each with npm run dev from its own folder. Existing environment settings remain unchanged; MongoDB automatically creates the new Submission and IssuedLink collections/indexes. Existing requests/videos are not rewritten.

- Backend: npm test
- Backend integration against isolated local MongoDB and simulated S3: npm run test:integration:local (downloads a MongoDB binary on first use; does not use your Atlas database)
- Frontend: npm test and npm run build
- Browser workflow with simulated camera/API: npm run test:browser (requires Playwright Chromium, installed with npx playwright install chromium if missing)

The browser script starts and stops its own Vite server on port 5188 and writes screenshots to frontend/test-artifacts/. It checks the create form, all themes, required questions, actual browser recording with fake devices, time refunds, retry behavior and mobile overflow. It does not replace testing real phones, Safari, or real AWS.

## Grouped employee response view

Each completed submission has a numbered Response heading, client details, submitted date and its own ZIP button. Its videos appear underneath in the original stored question order, with a divider before the next submission. Responses appear in ascending order: Response 1 first, then Response 2, Response 3, and so on across pages. New submissions are appended and do not renumber earlier submissions. Older single-video responses appear as individual groups without a ZIP button. Expired or unavailable answers disable the group ZIP button.

GET /api/requests/:id/responses now returns submissions with nested responses and pagination totals measured in submissions. The flat responses array remains for existing consumers and contains all videos in the selected groups. No stored documents need to be migrated.
