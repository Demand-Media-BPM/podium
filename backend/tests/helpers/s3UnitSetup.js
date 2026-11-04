require('./setupS3Env');
const { createS3Client } = require('../../config/s3');
const { createS3Service } = require('../../services/s3Service');
const { startFakeS3 } = require('./fakeS3Server');

const REQUEST_ID = '64b7f0c2a1b2c3d4e5f60718';
const RESPONSE_ID = '64b7f0c2a1b2c3d4e5f60719';
const creds = { accessKeyId: 'AKIATESTTESTTESTTEST', secretAccessKey: 'test-secret-key-not-real' };

// An S3 service (the application's real code) talking to a fake S3 server. No database, no AWS.
async function setupService(t) {
  const fake = await startFakeS3();
  t.after(() => fake.close());
  const settings = {
    region: 'eu-west-1',
    endpoint: fake.url,
    forcePathStyle: true,
    credentials: creds,
    uploadExpiresSeconds: 300,
    playbackExpiresSeconds: 60,
    downloadExpiresSeconds: 60,
  };
  const client = createS3Client(settings);
  t.after(() => client.destroy());
  return { fake, service: createS3Service({ client, bucket: fake.bucket, settings }) };
}

// What a browser does with a presigned POST: signed fields first, the file last.
async function postUpload(auth, data, { fields = {} } = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries({ ...auth.fields, ...fields })) form.append(k, v);
  form.append('file', new Blob([data]), 'x.bin');
  return fetch(auth.url, { method: 'POST', body: form });
}

module.exports = { setupService, postUpload, REQUEST_ID, RESPONSE_ID, creds };
