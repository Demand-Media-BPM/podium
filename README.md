# Video Response Tool

Employees create a questionnaire, choose a microsite theme, and share a short client-name link. Clients open it without login, enter their details, record a separate video for every question, review/re-record, give consent, and submit the set together. All final answers share a 59-minute allowance. Employees play individual answers or download the complete set as a ZIP.

**Current multi-question behavior, API, theme files, compatibility and test commands:** [docs/multi-question-flow.md](docs/multi-question-flow.md).

Videos use private AWS S3 by default, with verified direct browser uploads, short-lived employee playback/download links, and 180-day retention. Local storage remains available for development only. New recordings allow up to 2 GiB per video. Existing single-question requests and long links continue to work.

The phase-by-phase sections below document the original single-question implementation; the multi-question guide above describes the current extensions and updated limits.

## Technology stack

| Area          | Technology                                                            |
| ------------- | --------------------------------------------------------------------- |
| Frontend      | React (Vite), React Router DOM, Axios, Material UI + MUI Icons        |
| Backend       | Node.js, Express 5                                                    |
| Database      | MongoDB Atlas via Mongoose (database `video_response_tool`)          |
| Auth          | JWT in an HttpOnly cookie, Argon2id password hashing                  |
| Video storage | AWS S3, private bucket (later phase)                                  |
| Hosting       | AWS EC2 (later phase)                                                 |

## Folder structure

```
video-response-tool/
├── README.md
├── .gitignore
├── backend/
│   ├── server.js              # Validates env -> connects to MongoDB -> starts the HTTP server
│   ├── app.js                 # Express app factory (CORS, cookies, CSRF check, routes, errors)
│   ├── config/                # env.js (validation), db.js (Mongoose connection)
│   ├── models/                # User, Request, Response
│   ├── routes/                # healthRoutes, authRoutes
│   ├── controllers/           # healthController, authController
│   ├── middleware/            # auth (requireAuth/requireRole), csrf, rateLimiter, errorHandler
│   ├── services/              # passwordService, tokenService, userService
│   ├── utils/                 # AppError, cookies, access (ownership helpers)
│   ├── scripts/createAdmin.js # Interactive first-admin script
│   ├── tests/                 # unit/ and integration/ (node:test)
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── tokens.js theme.js themeComponents.js   # Design tokens and the MUI theme
    │   ├── styles/motion.js             # Small CSS animations (no animation library)
    │   ├── context/AuthContext.jsx      # In-memory auth state, login/logout
    │   ├── components/ui/               # Shared building blocks (PageHeader, StatusBadge, EmptyState, ...)
    │   ├── components/                  # layout/ requests/ responses/ client/ (recording journey), ProtectedRoute, ...
    │   ├── layouts/                     # AppLayout (employee shell), PublicLayout (client pages)
    │   ├── pages/ hooks/ services/      # services/api.js (Axios), services/authApi.js
    │   └── utils/                       # redirect, format, clientStage, requestSearch, ...
    ├── tests/                           # recorder, countdown, form, upload, redirect and stage tests
    └── .env.example
```

## Installation

Requirements: Node.js 18+ (developed on Node 22) and npm. `argon2` ships prebuilt binaries for common platforms.

```bash
cd backend  && npm install && cp .env.example .env     # PowerShell: Copy-Item .env.example .env
cd ../frontend && npm install && cp .env.example .env
```

## Configuration

### Backend `backend/.env` (git-ignored)

| Variable       | Required | Description                                                                              |
| -------------- | -------- | ---------------------------------------------------------------------------------------- |
| `PORT`         | no       | API port (default `5000`)                                                                |
| `FRONTEND_URL` | yes      | Exact origin of the frontend (`http://localhost:5173` locally). Used for CORS and the CSRF origin check. Must be `https://` in production |
| `MONGODB_URI`  | yes      | MongoDB Atlas connection string. The database name is set in code: `video_response_tool` |
| `JWT_SECRET`   | yes      | At least 32 characters. Never commit it                                                  |
| `PUBLIC_BASE_URL` | no    | Base URL used to build client links (`<base>/respond/<token>`). Defaults to `FRONTEND_URL`. Must be `https://` in production |
| `NODE_ENV`     | no       | `development` (default) or `production` (enables `Secure` cookies)                       |
| `TRUST_PROXY`  | no       | Number of reverse proxies in front of the API (e.g. `1` for nginx). Needed for correct per-IP login rate limiting behind a proxy |
| `UPLOAD_DIR`   | no       | **Development only** (`STORAGE_PROVIDER=local`). Folder for uploaded videos (relative to `backend/`, or absolute). Default `storage/uploads`. Must not be inside `frontend/`. Git-ignored |
| `STORAGE_PROVIDER` | no   | `s3` (default; the only value allowed when `NODE_ENV=production`) or `local` (development only). Not setting it means `s3`, so a forgotten setting can never use local files |
| `AWS_REGION`, `AWS_S3_BUCKET` | when `s3` | Region and name of your private bucket. See [docs/aws-s3-setup.md](docs/aws-s3-setup.md) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | no | Leave **both empty** to use the AWS credential chain: an AWS profile on your laptop, the IAM instance role on EC2 (recommended; no keys on the server). Set both or neither |
| `RETENTION_JOB` | no      | `on` (default) runs the 180-day cleanup inside the server every 6 hours; `off` if you run `npm run retention` from a scheduler |

The server refuses to start (and says which variable is wrong, never its value) if a required variable is missing or invalid.

**Generate a strong JWT secret:**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Changing `JWT_SECRET` signs everyone out.

### Frontend `frontend/.env`

```
VITE_API_BASE_URL=http://localhost:5000/api
```

Only `VITE_*` variables are exposed to the browser. Never put secrets in them.

## MongoDB Atlas setup

1. Create a free **M0** cluster at https://cloud.mongodb.com.
2. **Database Access** -> add a database user with a strong password and the `readWriteAnyDatabase` role (or `readWrite` on `video_response_tool` and `video_response_tool_test` if you run the integration tests). URL-encode special characters in the password (e.g. `@` -> `%40`).
3. **Network Access** -> allow your current IP for development. For EC2 later, allow the server's (elastic) IP, not `0.0.0.0/0`.
4. **Connect** -> **Drivers** -> copy the `mongodb+srv://...` string into `backend/.env` as `MONGODB_URI`. You do not need to add a database name; the app always uses `video_response_tool`.
5. Start the backend. You should see `MongoDB connected (database: video_response_tool)`. Collections and indexes are created automatically.

If the connection fails the API does not start, and the error message has credentials removed.

## Create the first admin

There is no public registration and no default account. Run this once, from the `backend` folder, in a real terminal:

## Running locally

```bash
# Terminal 1 - backend (http://localhost:5000)
cd backend
npm run dev        # nodemon; use `npm start` for a plain node process

# Terminal 2 - frontend (http://localhost:5173)
cd frontend
npm run dev
npm run build      # production build
```

Open http://localhost:5173 and sign in with the admin account you created.

## Tests

```bash
cd backend
npm test                  # unit tests, no database needed
npm run test:integration  # needs MONGODB_URI; uses the throwaway database video_response_tool_test
cd ../frontend
npm test                  # recorder, form validation, upload error handling, redirect safety
```

Backend integration tests include real multipart uploads (including exactly 100 MiB and 100 MiB + 1 byte). They write
videos to a temporary folder in the OS temp directory and delete it afterwards.

Integration tests refuse to run against any database whose name does not end in `_test`, drop that database before and after, and are skipped (not passed) when `MONGODB_URI` is not set.

## Routes

### Frontend

| Path              | Access   | Notes                                                                   |
| ----------------- | -------- | ----------------------------------------------------------------------- |
| `/`               | -        | Signed in -> `/dashboard`; signed out -> `/login`                       |
| `/login`          | public   | Real login. Signed-in users are sent to `/dashboard`                    |
| `/dashboard`      | employee | Real totals and a paginated request list (admins see everyone's)        |
| `/requests`       | employee | Every request, 15 per page, with search                                 |
| `/requests/new`   | employee | Create a request; the link is shown once on the success screen          |
| `/requests/:id`   | employee | Details, edit, close/reopen, regenerate link                            |
| `/respond/:token` | public   | Question, client form, camera recording, preview, submit (never redirects to login) |
| `/thank-you`      | public   | Confirmation after a saved submission; a direct visit shows a neutral message |

Frontend route protection is only for user experience. The backend enforces the real access rules.

### Backend API

| Method | Path                | Auth   | Description                                                      |
| ------ | ------------------- | ------ | ---------------------------------------------------------------- |
| GET    | `/api/health`       | none   | `{ "success": true, "message": "Video Response API is running" }` |
| GET    | `/api/health/ready` | none   | 200 when MongoDB is connected, 503 otherwise                     |
| POST   | `/api/auth/login`   | none   | Body `{ email, password }`. Sets the session cookie. Rate limited |
| GET    | `/api/auth/me`      | cookie | Returns `{ id, name, email, role }` of the signed-in user        |
| POST   | `/api/auth/logout`  | none   | Clears the session cookie                                        |
| POST   | `/api/requests`     | cookie | Create a request. Body `{ title, question, expiresAt? }`. Returns `{ request, url }` (201) |
| GET    | `/api/requests`     | cookie | Own requests (admin: all), newest first. `?page=1&limit=10` (limit max 50). Includes response counts |
| GET    | `/api/requests/summary` | cookie | `{ totalRequests, activeRequests, totalResponses }` for the dashboard |
| GET    | `/api/requests/:id` | cookie | One request (owner or admin, otherwise 404)                      |
| PATCH  | `/api/requests/:id` | cookie | Update `title`, `question`, `status` (`active`/`closed`), `expiresAt` (`null` clears it) |
| POST   | `/api/requests/:id/regenerate-link` | cookie | New token; the old link stops working immediately. Returns `{ request, url }` |
| GET    | `/api/public/:token` | none  | `{ request: { title, question, maxDurationSeconds } }` for active, non-expired links; otherwise a generic 404. Rate limited |
| POST   | `/api/public/:token/uploads` | none | **S3 mode.** JSON `{ submissionId, clientName, clientEmail, consentAccepted: true, durationSeconds, mimeType, fileSize }`. Creates a *pending* response and returns `{ responseId, completionToken, upload: { url, fields } }` (a 5-minute presigned POST for one key and the exact size). `200 { alreadySubmitted: true }` for a retry that was already completed. Rate limited (20/hour per IP) |
| POST   | `/api/public/:token/uploads/:responseId/complete` | none | **S3 mode.** Body `{ completionToken }`. Verifies the object in S3 (size, type, metadata, file signature) and only then marks the response `submitted`. Needs the link token **and** the response id **and** the completion token; idempotent |
| POST   | `/api/public/:token/responses` | none | **Development only** (`STORAGE_PROVIDER=local`): multipart upload through the API (the Phase 4 flow). Answers 404 in S3 mode |
| GET    | `/api/requests/:id/responses` | cookie | Responses of a request (owner or admin): name, email, dates, length, size, status. `?page=1&limit=20`. Never includes keys or paths |
| GET    | `/api/responses/:id/play` | cookie | `{ kind: "signed", url }` - a 60-second signed S3 URL for the video player. 410 if the video expired or is missing. Never cached |
| GET    | `/api/responses/:id/download` | cookie | Same, with `Content-Disposition: attachment` and a safe generated file name |
| GET    | `/api/requests/:id/responses/:responseId/video` | cookie | **Development only** (`local` mode). Streams a local test recording. 404 in S3 mode |

Errors always look like `{ "success": false, "message": "...", "code": "...", "details": { "field": "message" } }` (`details` only for validation errors). There is no delete endpoint and no public listing endpoint.

## Database schemas

Database `video_response_tool`, all collections with `createdAt`/`updatedAt` timestamps.

- **users**: `name`, `email` (unique, lowercase), `passwordHash` (Argon2id, hidden from queries), `role` (`admin`/`employee`, default `employee`), `isActive` (default `true`)
- **requests**: `title` (max 150), `question` (max 2000), `tokenHash` (SHA-256 of the link token, unique when present, hidden from queries), `tokenIssuedAt`, `createdBy` -> users, `status` (`active`/`closed`), `maxDurationSeconds` (default 120), `expiresAt` (optional)
- **responses**: `requestId` -> requests, `submissionId` (client UUID; unique together with `requestId`, makes retries idempotent), `clientName`, `clientEmail`, `videoKey` (the final S3 key `responses/<requestId>/<uuid>.<ext>`; hidden from queries), `storageProvider` (`s3`/`local`; Phase 4 records have the older field `storage` instead and are read through either), `mimeType`, `fileSize`, `durationSeconds`, `consentAccepted`, `status` (`pending_upload`/`submitted`/`expired`/`failed`), `submittedAt`, `deleteAt` (retention deadline), `expiredAt`, `failureReason`. Hidden upload-handshake fields: `uploadKey` (`pending/...`), `uploadTokenHash` (SHA-256 of the completion token), `uploadIssuedAt`, `migratedFromLocalKey`
- **joblocks**: one tiny lease document per scheduled job, so only one server instance runs it at a time

`responses.deleteAt` is a plain date for a future cleanup job that deletes the S3 video after 180 days. It is deliberately **not** a TTL index, so the response record is kept as submission history.

```bash
cd backend
npm run create-admin
```

It prompts for name, email and password (the password is not echoed, must be 12-128 characters, and must be typed twice). The password and hash are never printed. A duplicate email is rejected. An authenticated admin-only "create employee" feature is planned for a later phase.

## How authentication works

1. `POST /api/auth/login` validates input, normalizes the email, loads the user and verifies the password with Argon2id. Unknown email, wrong password and inactive account all return the same `401 Invalid email or password`; unknown emails still do a dummy hash check so response times do not reveal which emails exist.
2. On success the server signs a JWT (HS256, 8 hours, containing only the user id as `sub`, plus issuer/audience) and sets it in an **HttpOnly, SameSite=Lax** cookie (`Secure` in production). Browser JavaScript can never read it and nothing is put in localStorage/sessionStorage.
3. `requireAuth` checks the cookie on every protected request: it verifies the token (algorithm pinned, issuer/audience checked), then loads the user from MongoDB and requires `isActive`. Role and active status are never taken from the token, so deactivating a user or changing a role takes effect immediately.
4. `requireRole('admin')` etc. restricts routes by role; admins pass every role check. `utils/access.js` has `ownerFilter()` and `canAccessOwnedResource()` so future request/response routes only expose an employee's own data (admins see all).
5. The React `AuthContext` calls `/api/auth/me` once on startup, keeps the safe profile in memory, and signs the user out in the UI if any later API call returns 401.
6. `POST /api/auth/logout` clears the cookie using the same attributes it was set with.

**Brute-force protection:** 10 failed login attempts per IP per 15 minutes, then `429` (successful logins are not counted).

**CSRF defense:** every state-changing request (POST/PUT/PATCH/DELETE) must carry an `Origin` (or `Referer`) header matching `FRONTEND_URL`, otherwise it gets `403`. Together with `SameSite=Lax` cookies and JSON-only bodies this blocks cross-site request forgery for the planned same-site deployment.

**If the frontend and API are ever on different sites** (different registrable domains, e.g. `app.example.com` and `api.other.com`): `SameSite=Lax` cookies will not be sent on API calls. You would need `SameSite=None; Secure`, a real CSRF token (double-submit or synchronizer token) in addition to the Origin check, and the exact frontend origin in `FRONTEND_URL`. Subdomains of one domain (`app.example.com` + `api.example.com`) count as the same site and work with the current settings.

**Known limitation:** JWTs are stateless, so logout removes the cookie from the browser but does not revoke a copy of the token stolen earlier; it still expires within 8 hours. Deactivating the user does revoke it immediately.

## How shareable links work

1. Creating a request generates a token with `crypto.randomBytes(32)` (256 bits), encoded as 43 URL-safe base64url characters.
2. Only the **SHA-256 hash** of the token is stored (`requests.tokenHash`, unique). The raw token is never written to MongoDB or logs. Because the token is high-entropy random data, a fast unsalted hash is appropriate and lets the server look the request up by hash.
3. The API returns the full link (`<PUBLIC_BASE_URL>/respond/<token>`) **once**, in the create or regenerate response. The UI shows it with a Copy Link button and a clear warning.
4. Because only a hash is stored, **the link cannot be recovered later**. The Request Details page says so and offers **Regenerate link**, which (after a confirmation) atomically replaces the hash in one database update. The old link stops working immediately; the new one is shown once.
5. `GET /api/public/:token` hashes the supplied token and finds an `active`, non-expired request. Malformed, unknown, closed and expired links return the identical generic 404, so a visitor cannot tell them apart. It returns only `title`, `question` and `maxDurationSeconds`: no employee details, ids or hashes. It is rate limited (120 requests per 15 minutes per IP) and sent with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
6. Closing a request (or letting `expiresAt` pass) makes its link unavailable. Reopening restores the same link. Editing a request does not change its link.

Employees can only see and change their own requests; admins can manage all. Another employee's request id returns 404 (not 403), so ids cannot be probed. Request text is stored as plain text and always rendered through React (escaped), never as HTML.

## How recording and submission work (Phase 4)

**In the browser** (`/respond/:token`, no login):

1. The client enters a name, an email and ticks the consent box (`I consent to the recording, storage, and internal use of my video response.`).
2. **Allow camera and microphone** calls `navigator.mediaDevices.getUserMedia()` (720p is only a preference; any camera works). Both video and audio are required. Denied access, no device, a device in use, a browser without `MediaRecorder` and a non-HTTPS page each show a specific message with a retry.
3. **Start recording** uses the native `MediaRecorder`. The format is chosen with `MediaRecorder.isTypeSupported()`: WebM where available (Chrome, Edge, Firefox, Android), otherwise MP4 (Safari/iPhone). Nothing is hardcoded.
4. A timer shows the length. Recording **stops automatically at 120 seconds** (or earlier if the data would exceed 100 MB, or if a device is unplugged, in which case the footage so far is kept).
5. The recording is shown in a player (an object URL, revoked when no longer needed). **Re-record** discards it and keeps the name and email. Nothing is uploaded until **Submit response** is pressed.
6. The camera and microphone tracks are stopped as soon as recording ends, when recording fails, and when the page is left.
7. Submit uploads with a progress bar. The page goes to `/thank-you` **only after the server confirms the response was saved**. On a network error the recording is kept and the client can retry.

**Duplicate protection:** the browser creates a random `submissionId` for each recording and re-sends the same one on a retry. If the first attempt reached the server but the reply was lost, the retry gets the existing response back (`200`, `duplicate: true`) instead of creating a second one. A unique index on `(requestId, submissionId)` also covers simultaneous retries.

> Step 7 above describes what the client sees. In S3 mode (the default) the browser sends the video straight to S3 in
> three steps instead of through the API; see **"How S3 upload, playback and retention work (Phase 5)"** below. The
> numbered server steps in this section describe the **development-only local flow** (`STORAGE_PROVIDER=local`).

**On the server, development-only local flow** (`POST /api/public/:token/responses`), in this order:

1. Rate limit (20 uploads per hour per IP).
2. The link is checked (active and not expired) **before** the body is read, so a bad link never makes the server accept a large upload. All unusable links get the same generic 404.
3. `multer` streams the one `video` file to a randomly named temporary file (never to memory). The client's file name is ignored. More than one file, a file in another field, or a body over 100 MiB (104,857,600 bytes) is refused and the partial file deleted.
4. Name (max 100), email (valid, max 254), consent (exactly `true`), duration and the submission id are validated. Unknown fields are rejected.
5. The file type is decided from the **file's own bytes** (WebM/EBML or MP4 `ftyp` signature), never from its name or the `Content-Type` the client sent. Anything else is rejected with 415. This checks the container signature only; it does not prove the file is a playable video.
6. The request is checked again (it could have been closed during a long upload), the file is moved to `<UPLOAD_DIR>/<requestId>/<random-uuid>.<webm|mp4>`, and **only then** is the response saved as `submitted` with `deleteAt` = 180 days later. If saving fails, the file is deleted again, so no orphan is left. Temporary files are removed on every outcome, and leftover partial uploads older than an hour are cleaned up at startup.

`durationSeconds` is what the browser reports. The server cannot measure a video without decoding it, so it is validated (positive, at most 120 s plus 2 s tolerance) and stored for display only; it is not a security control.

**Where videos are stored (development only):** `backend/storage/uploads/` by default (change with `UPLOAD_DIR`). It is outside the frontend, is **not** served by Express (there is no static route), is git-ignored, and the server refuses to start if `UPLOAD_DIR` is inside `frontend/`. The only way to watch a video is `GET /api/requests/:id/responses/:responseId/video`, which requires a signed-in owner or admin. Stored keys are re-validated against a strict pattern before they are turned into a path, so a tampered database value cannot read files outside the folder. API responses never contain a file path or key. In S3 mode this store and its endpoints are switched off.

**Employees** see each request's responses (name, email, date, length, size, status, "video until" date) on the request details page and can play and download them. Employees see only their own requests' responses; admins see all.

## How S3 upload, playback and retention work (Phase 5)

Full AWS setup, with ready-to-use policy files: **[docs/aws-s3-setup.md](docs/aws-s3-setup.md)**.

### Upload (browser -> S3)

1. `POST /api/public/:token/uploads` (JSON). The server checks that the link is active and not expired, validates the name,
   email, consent, duration, `video/webm` or `video/mp4`, and the **exact byte size** (1 KiB to 100 MiB; anything larger
   gets a 413 and no authorization). It creates a **pending** response and returns a **presigned POST** that is valid for
   **5 minutes** and pinned to **one object key** under `pending/`, **that exact size**, that content type, SSE-S3
   encryption and the response id. S3 itself rejects any other size, key, type or extra field, so the 100 MB limit is
   enforced by S3 and not only by the browser. The browser never chooses a key or bucket.
2. The browser sends the video to S3 with that authorization.
3. `POST /api/public/:token/uploads/:responseId/complete` with the **completion token** returned in step 1. The server
   checks the object in S3: it exists, has the declared size and type, carries the right response id, and starts with a real
   WebM or MP4 signature. Only then does it copy it to `responses/` (only if it is still the exact version it checked, via
   an `If-Match` copy) and atomically switch the response from `pending_upload` to `submitted`. A bad file is deleted and the
   response marked `failed`; it can never become `submitted`.

**Authorization:** completion needs the public link token **and** the response id **and** the completion token. The token
is random (256 bits), shown only to the browser that started the upload, and stored only as a SHA-256 hash. A response id
alone is useless, and one visitor cannot touch another visitor's submission. Every failure looks the same (404).

**Retries:** the browser keeps one `submissionId` per recording. Asking to start again with the same id reuses the same
record, issues a fresh key and token (older ones stop working) and deletes any object the earlier attempt left behind. If the
upload already reached S3 but the confirmation was lost, only the completion call is repeated. Completing twice, or six times
at once, submits it once.

**What is and is not validated:** the server checks size, declared and uploaded type, and the container signature (the first
bytes of the file). It does **not** decode the video, so a corrupt file with a valid WebM/MP4 header would be accepted, and the
recording length is reported by the browser and not measured on the server.

### Playback and download (S3 -> employee)

`GET /api/responses/:id/play` and `/download` require a signed-in employee who owns the request (or an admin). They refuse
pending, failed and expired responses, check that the object really exists in S3, and return a **presigned GET URL that lasts
60 seconds**. Download sets `Content-Disposition: attachment` with a generated name (`response-<name>-<date>-<id>.webm`), never
a name taken from the client's file. The responses are sent with `Cache-Control: private, no-store`. The URL only has to be valid
when playback *starts*; a video already playing is not interrupted. The bucket never serves anything without a signature.

### 180-day retention

- `deleteAt` = the S3 object's creation time + 180 days, set once when the response becomes `submitted` and never changed.
- An S3 **lifecycle rule** deletes `responses/` objects after 180 days and `pending/` objects after 1 day (rules are in
  [docs/aws/lifecycle.json](docs/aws/lifecycle.json); you apply them, the application never changes AWS settings).
- S3 expiry is **asynchronous** (can lag by a day or more). The **application refuses playback and download from `deleteAt`**
  whether or not S3 has deleted the file, and the table shows such a video as **Expired** immediately.
- A job runs every 6 hours inside the server (or `npm run retention` from cron with `RETENTION_JOB=off`). It marks due
  records `expired`, clears their `videoKey`, deletes the object if S3 has not yet, and marks abandoned pending uploads (older
  than 24 hours) `failed`. It is idempotent, safe when the object is already gone, logs without client data, and uses a MongoDB
  lock so several server instances never run it at once. It never deletes database records and there is no TTL index: the
  name, email and dates are kept as minimal submission history.

### Old local test recordings

Phase 4 test videos are labelled "local test file" and cannot be played in S3 mode. Nothing migrates or deletes them
automatically. `npm run list-local-videos` (read-only), `npm run migrate-local-videos` (type `MIGRATE`; copies to S3 and keeps
the local files) and `node scripts/migrateLocalVideos.js --cleanup` (type `DELETE`) are described in
[docs/aws-s3-setup.md](docs/aws-s3-setup.md#13-old-local-test-recordings-from-phase-4).

### Manual browser checklist (needs a real camera and microphone)

Automated tests use a simulated camera, so please also try these by hand:

- [ ] Desktop Chrome, Edge, Firefox, Safari: open a link, allow access, record 10 s, preview, re-record, submit. Confirm the file plays in the employee dashboard.
- [ ] iPhone Safari and Android Chrome: same flow. Check the preview is not mirrored incorrectly in the saved video, that the video plays on desktop, and that the page works in portrait and landscape.
- [ ] Deny the permission, then allow it in the browser settings and press **Try again**.
- [ ] Unplug or disable the camera/microphone while recording: the footage so far should be kept.
- [ ] Switch tabs or lock the phone while recording (mobile browsers may pause the camera) and confirm the result is understandable.
- [ ] Record the full 2 minutes: it must stop by itself and submit.
- [ ] Turn Wi-Fi off during an upload: an error appears, the recording stays, and **Try submitting again** works once Wi-Fi is back, with only one response created.
- [ ] Open the page over plain `http://` on another device (not localhost): it must explain that HTTPS is required.
- [ ] Check the camera light switches off after recording and after leaving the page.

## User interface and design system (Phase 5.5)

The interface was redesigned without changing any API, authentication rule, upload step or retention rule.

- **Look:** one theme (`frontend/src/tokens.js`, `theme.js`, `themeComponents.js`): primary `#635BFF`, page background `#F7F8FC`, text `#172033`, Inter font, rounded cards with soft shadows. Colours, spacing, radii and timings come from the tokens, not from individual pages.
- **Employee area:** a fixed sidebar (Dashboard, My Requests, Create Request, profile and role, Log out) from 900 px up; a menu button and slide-in drawer below that. Tables become cards on phones. A "Skip to content" link is the first Tab stop.
- **Public client page** (`/respond/:token`): no sidebar and no login. A welcome modal collects name and email, then a two-column page shows the question (about 40 %) beside the camera (about 60 %); on screens under 900 px they stack. Steps: details, record, review, submit.
- **Recording:** the camera is only requested when the client presses **Turn on camera and microphone**. **Start Recording** runs a 3-2-1 countdown that can be cancelled; the red REC badge and timer appear only once the real recorder is recording. The timer lives in its own component so the video and the page do not re-render every second.
- **Animations:** short CSS animations only (150-300 ms: fade, a gentle recording pulse, the countdown number, an animated check on the Thank You page). `prefers-reduced-motion` switches them all off. No animation library was added.
- **Search** on the dashboard and My Requests filters the loaded page in the browser (the API has no search endpoint). When there is more than one page, the screen says so.
- **Dependencies:** none were added in this phase.

### Previewing the interface

```bash
cd backend && npm run dev     # http://localhost:5000
cd frontend && npm run dev    # http://localhost:5173
```

Sign in as an employee, create a request, and open the copied link in a private window to see the client journey.
`npm run build` in `frontend/` produces the production bundle (employee pages are loaded on demand).

The interface was exercised in headless Chrome against a throwaway database and a fake S3 with a simulated camera. That
does **not** replace the manual checklist above: real cameras, phones and Safari have not been tested.

## Production notes

- Videos must be in S3: `STORAGE_PROVIDER=local` and `AWS_S3_ENDPOINT` are refused when `NODE_ENV=production`. Use an **IAM instance role** on EC2 (leave the AWS keys unset). Apply the CORS and lifecycle files from `docs/aws/` before going live.
- Camera access needs **HTTPS** (or `localhost`). Browsers block it on plain `http://` pages.
- Set `NODE_ENV=production` and an `https://` `FRONTEND_URL`. Serve both frontend and API over HTTPS (for example nginx on one domain, proxying `/api` to port 5000), and set `TRUST_PROXY=1`.
- Keep `.env` out of Git and restrict the Atlas IP access list.
- `npm audit` currently reports 3 high-severity findings, all in **nodemon** (a development dependency: `braces`/`chokidar`, a regex denial of service). They do not affect `npm start` or `npm install --omit=dev`.

## Planned for later phases

- **Phase 6 (suggested):** hardening and production readiness (security headers, request logging, backups of MongoDB, monitoring and alerts)
- **Phase 7 (suggested):** admin-only employee management, deployment on AWS EC2 behind HTTPS
