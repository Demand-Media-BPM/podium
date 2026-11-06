# AWS S3 setup for the Video Response Tool

This guide sets up a **private** S3 bucket for client videos. Nothing here is done automatically: the application never
creates or changes AWS resources. You run these steps yourself, in your own AWS account, and you can review every
setting first. Ready-to-use policy files are in [`docs/aws/`](aws/).

Replace `YOUR-BUCKET-NAME`, `YOUR-REGION` and `https://tool.example.com` everywhere. Never put access keys in this
repository, in chat, or in any file that is committed.

## How the application uses the bucket

| Prefix       | Written by              | Purpose                                         | Lifecycle rule        |
| ------------ | ----------------------- | ----------------------------------------------- | --------------------- |
| `pending/`   | the client's browser    | A new upload, allowed for 5 minutes, one key    | deleted after 1 day   |
| `responses/` | the server (a copy)     | A verified, submitted video                     | deleted after 60 days |

1. The browser asks the API to start a submission. The API returns a **presigned POST** that is valid for **5 minutes**,
   for **one** object key under `pending/`, for **exactly** the declared size (never above 100 MiB), one content type, and
   with SSE-S3 encryption required. S3 itself refuses anything else.
2. The browser uploads straight to S3. Then it asks the API to complete the submission.
3. The API checks the object (size, type, the response id stamped in it, and the first bytes of the file), copies it to
   `responses/`, and only then marks the response `submitted`.
4. Employees watch or download through **presigned GET URLs that last 60 seconds**. The bucket never serves anything
   publicly.

## 1. Choose a region

Pick the AWS region closest to your clients and employees (for example `eu-west-1` for Europe, `us-east-1` for the
eastern US, `ap-south-1` for India). Latency matters little for 5-10 videos a month, so also consider your data-residency
rules. The region cannot be changed later without moving the data. Use the same region in `AWS_REGION`.

## 2. Create the bucket (with Block Public Access)

Use a dedicated bucket for this application. Do not share it with other projects: the lifecycle rules below are scoped
by prefix, but a dedicated bucket keeps permissions and deletion rules simple.

**Console:** S3 -> Create bucket -> General purpose.

- Bucket name: globally unique, lowercase, for example `acme-video-responses-prod`.
- Region: from step 1.
- **Object Ownership:** ACLs disabled (Bucket owner enforced).
- **Block all public access:** leave **all four** options ticked.
- **Bucket Versioning:** **Disable** (see "Versioning" below).
- **Default encryption:** Server-side encryption with Amazon S3 managed keys (SSE-S3).
- Create bucket.

**CLI equivalent** (needs an admin profile; review before running):

```bash
aws s3api create-bucket --bucket YOUR-BUCKET-NAME --region YOUR-REGION \
  --create-bucket-configuration LocationConstraint=YOUR-REGION   # omit this line for us-east-1

aws s3api put-public-access-block --bucket YOUR-BUCKET-NAME --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-ownership-controls --bucket YOUR-BUCKET-NAME \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
```

If your AWS account has *account-level* Block Public Access turned on, that is good: leave it on. This guide never
changes account-wide settings.

## 3. Encryption (SSE-S3)

New buckets encrypt every object with SSE-S3 by default. The application also **requires** it: every presigned upload
includes `x-amz-server-side-encryption: AES256` as a policy condition, and the server's copy sets it too. To set it
explicitly:

```bash
aws s3api put-bucket-encryption --bucket YOUR-BUCKET-NAME --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
```

SSE-S3 is free and enough for this use. (SSE-KMS adds cost and needs extra IAM permissions; this application is not
configured for it.)

## 4. Require HTTPS (optional but recommended)

[`docs/aws/bucket-policy-tls-only.json`](aws/bucket-policy-tls-only.json) denies any request that is not over HTTPS.
Presigned URLs are `https://` already, so this only blocks accidental plain-HTTP access.

```bash
aws s3api put-bucket-policy --bucket YOUR-BUCKET-NAME --policy file://docs/aws/bucket-policy-tls-only.json
```

Edit the bucket name in the file first. Do not add any statement that allows `Principal: "*"` to read.

## 5. Least-privilege IAM policy

[`docs/aws/iam-policy-app.json`](aws/iam-policy-app.json) is everything the application needs:

- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` only on `pending/*` and `responses/*`;
- `s3:ListBucket` limited to those two prefixes. This is needed so that asking for a missing object returns "not found"
  instead of "access denied"; the application never lists the bucket.

It grants **no** permission to change the bucket, its policy, its lifecycle, its encryption or Block Public Access.
Create it in IAM -> Policies -> Create policy -> JSON, name it `video-response-tool-s3`.

The presigned POST is signed with the application's own credentials, so the policy above also limits what any presigned
URL can do: a signature can never grant more than the signer has.

## 6. CORS

The browser uploads directly to S3 from your site, so S3 must allow your site's origin.
[`docs/aws/cors.json`](aws/cors.json) allows:

- `POST` (the presigned form upload) and `GET`/`HEAD` (video playback) from **your exact site origin only**;
- no wildcard origin. Use the same origin as `PUBLIC_BASE_URL` / `FRONTEND_URL`. For local testing you may temporarily
  add `http://localhost:5173`, and remove it afterwards.

```bash
aws s3api put-bucket-cors --bucket YOUR-BUCKET-NAME --cors-configuration file://docs/aws/cors.json
```

CORS is a browser rule, not a security boundary: the presigned policy and IAM are what protect the bucket.

## 7. 60-day expiry (lifecycle rules)

[`docs/aws/lifecycle.json`](aws/lifecycle.json) has two rules, each scoped to one prefix, so nothing else in the bucket
is ever touched:

| Rule                      | Prefix       | Action                     |
| ------------------------- | ------------ | -------------------------- |
| expire submitted videos   | `responses/` | delete after **60 days**  |
| expire unfinished uploads | `pending/`   | delete after **1 day**     |

Both also abort incomplete multipart uploads after 1 day. The application does not use multipart uploads today; the
setting costs nothing and protects you if that changes.

```bash
aws s3api put-bucket-lifecycle-configuration --bucket YOUR-BUCKET-NAME --lifecycle-configuration file://docs/aws/lifecycle.json
```

**This replaces any existing lifecycle configuration on the bucket.** Check first with
`aws s3api get-bucket-lifecycle-configuration --bucket YOUR-BUCKET-NAME` and merge rules if there are any.

### How the 60 days are counted (the policy this application uses)

- S3 counts an object's age from **when that object was created in S3**. The application's `responses/` object is created
  when the server verifies and copies the upload, a few seconds after the client pressed Submit.
- The application stores the retention deadline in MongoDB as `deleteAt` = **that S3 object's creation time + 60 days**,
  set when the response becomes `submitted`. Old 180-day records are shortened once on startup, as described in [the retention policy](retention-policy.md). The deadline the app enforces and the
  deadline S3 enforces therefore start from the same clock. (`submittedAt` is a few seconds earlier and is not used for
  retention.)
- S3 lifecycle expiry is **asynchronous**: eligible objects are queued for removal, which can take a day or more, and S3
  rounds the expiry time up to midnight UTC. The **application refuses playback and download from `deleteAt` onwards**,
  whether or not S3 has physically removed the file yet.
- A scheduled job (below) marks records `expired`, clears the stored key, and deletes the object itself if S3 has not yet.

### Versioning

Keep **Versioning disabled** on this dedicated bucket. With versioning on, an expiration only adds a delete marker; the old
video version remains (and is billed) until a noncurrent-version rule removes it. If a company policy forces versioning on,
add a `NoncurrentVersionExpiration` of 1 day to both rules and a separate rule with `ExpiredObjectDeleteMarker: true`
(it cannot be combined with `Days` in the same `Expiration`), or videos will outlive 60 days.

### Backups, replication and complete removal

The 60-day rule removes the object from **this bucket only**. Anything that copied the video earlier is unaffected: S3
replication, AWS Backup, inventory exports, employee downloads and local copies. MongoDB Atlas backups hold only names,
emails and dates, not video. If you must prove complete removal, do not enable replication or backups for this bucket, or
give those copies their own expiry. The application keeps minimal submission history (name, email, dates, size) after the
video is gone; delete those records separately if your policy requires it.

## 8. Credentials

### On your laptop (development)

Prefer an AWS profile over keys in `.env`:

1. Create an IAM user (for example `video-response-tool-dev`) and attach only the policy from step 5.
2. Run `aws configure --profile vrt-dev` and enter that user's access key. This stores it in `~/.aws/credentials`,
   outside the project.
3. Start the backend with `AWS_PROFILE=vrt-dev` (PowerShell: `$env:AWS_PROFILE='vrt-dev'; npm run dev`) and leave
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` empty in `backend/.env`.

If you do put keys in `backend/.env`, that file is git-ignored; never share it. The application refuses to start if only
one of the two is set.

### On EC2 (production): use an instance role, no keys

1. IAM -> Roles -> Create role -> trusted entity **AWS service / EC2**
   ([`docs/aws/ec2-trust-policy.json`](aws/ec2-trust-policy.json)).
2. Attach the policy from step 5. Name it `video-response-tool-ec2`.
3. Attach the role to the instance: EC2 -> instance -> Actions -> Security -> Modify IAM role.
4. Leave `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` **unset** on the server. The AWS SDK finds the role credentials by
   itself and rotates them automatically.
5. Require IMDSv2 on the instance (Actions -> Instance settings -> Modify instance metadata options).

## 9. Environment variables

In `backend/.env` (see `backend/.env.example`):

```
STORAGE_PROVIDER=s3
AWS_REGION=YOUR-REGION
AWS_S3_BUCKET=YOUR-BUCKET-NAME
AWS_ACCESS_KEY_ID=          # empty: use a profile (laptop) or the instance role (EC2)
AWS_SECRET_ACCESS_KEY=      # empty: same
RETENTION_JOB=on            # in-process 60-day cleanup every 6 hours; "off" to run `npm run retention` from cron
```

## 10. Test uploads and downloads

Do this with a **test request**, not a real client link.

1. Set the variables from step 9 and start the backend (`npm run dev`) and frontend. The backend prints
   `Video storage: S3 bucket "..." in ...` at startup. If it prints an error instead, fix the variable it names.
2. Sign in, create a request, copy the link and open it in a private window.
3. Fill in a name and email, tick consent, record 10 seconds, press **Submit response**. You should land on the Thank You
   page.
4. In the AWS console, open the bucket: the video is under `responses/<requestId>/<id>.webm` (or `.mp4`) and `pending/`
   is empty. Open the object's properties and confirm **Server-side encryption: SSE-S3**.
5. Back in the dashboard, open the request and press **Play Video**, then **Download Video**. The downloaded file name
   looks like `response-<name>-<date>-<id>.webm`.
6. Check MongoDB: the response has `status: "submitted"`, `storageProvider: "s3"` and a `deleteAt` 60 days ahead.

If the upload fails in the browser with a network or CORS error, check step 6 (CORS) and that the page's origin is
exactly the one in `cors.json`.

## 11. Verify the videos are private

```bash
# 1. Anonymous read of a real object must be refused (403):
curl -I "https://YOUR-BUCKET-NAME.s3.YOUR-REGION.amazonaws.com/responses/<requestId>/<id>.webm"

# 2. The bucket must refuse anonymous listing (403):
curl -i "https://YOUR-BUCKET-NAME.s3.YOUR-REGION.amazonaws.com/?list-type=2"

# 3. Block Public Access must show all four settings true:
aws s3api get-public-access-block --bucket YOUR-BUCKET-NAME

# 4. The bucket must not have a public policy or ACL grants:
aws s3api get-bucket-policy-status --bucket YOUR-BUCKET-NAME   # IsPublic: false
aws s3api get-bucket-acl --bucket YOUR-BUCKET-NAME              # only your own account as owner
```

Then check the signed link behaviour: press **Play Video**, copy the video address from your browser's developer tools
(Network tab), wait **more than 60 seconds** and open it in a new tab. S3 must answer `AccessDenied` / `Request has
expired`. A link only has to be valid when playback *starts*; a video that is already playing keeps playing.

## 12. Storage usage and expected cost

At 5-10 videos a month, cost is small. A 2-minute 720p browser recording is typically 10-40 MB (the recorder targets about
2.5 Mbit/s, roughly 35 MB for two minutes); the hard cap is now 2 GiB per video (59 minutes total across question answers).

| Item (US East pricing, check your region)        | Rough monthly figure                        |
| ------------------------------------------------ | ------------------------------------------- |
| Storage: 10 videos x 35 MB, kept 60 days (~20 videos)  | ~0.7 GB x ~$0.023/GB = **about $0.02**      |
| Requests (uploads, copies, plays)                | well under **$0.01**                         |
| Data out to the internet (downloads/plays)       | first 100 GB/month free; effectively **$0**  |

Expect **well under $1 per month**. Prices change, so confirm on the AWS S3 pricing page.

To check usage: S3 console -> bucket -> **Metrics** (storage by day), or

```bash
aws s3 ls s3://YOUR-BUCKET-NAME/responses/ --recursive --human-readable --summarize
```

Set a safety net in **AWS Billing -> Budgets**: a monthly cost budget of, say, $5 with an email alert.

## 13. Old local test recordings (from Phase 4)

Phase 4 stored development videos in `backend/storage/uploads/`. Those records have `storage: "local"` (and no
`storageProvider`); the application reads either field, so they still load and are shown with a "local test file" label.
**Nothing deletes or moves them automatically.**

- While `STORAGE_PROVIDER=s3`, a local recording cannot be played ("local development test recording") and is skipped by
  the retention job's S3 deletion. Their `deleteAt` still applies; the job marks them expired and removes the local file.
- To keep one, migrate it. Three explicit steps, none of which deletes anything until you type a confirmation word:

```bash
cd backend
npm run list-local-videos      # read-only report: which records, file present or missing, size
npm run migrate-local-videos   # type MIGRATE: copies each file to S3 (responses/), verifies size, then repoints the record
node scripts/migrateLocalVideos.js --cleanup   # type DELETE: removes local copies of videos that still verify in S3
```

The migration needs `STORAGE_PROVIDER=s3` and working AWS settings, keeps the local files, only changes a record after
the S3 copy is verified, and sets a fresh 60-day `deleteAt` from the S3 object's creation time. Run the report first,
check that the migrated videos play, and only then run `--cleanup`. If you do not care about the test recordings, you can
simply delete the `backend/storage/` folder and the test requests yourself.


With `NODE_ENV=production`, `STORAGE_PROVIDER=local` and a custom `AWS_S3_ENDPOINT` are refused at startup. If
`STORAGE_PROVIDER` is not set at all, the default is `s3`, so a forgotten setting can never fall back to local files.
The frontend needs no AWS settings and must never get any.

