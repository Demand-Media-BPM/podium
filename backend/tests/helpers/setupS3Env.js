// Require this FIRST (instead of setupEnv.js) in tests that exercise the S3 flow. It points the application at the
// in-process fake S3 server from fakeS3Server.js, using dummy credentials. No real AWS account is involved.
require('./setupEnv');

process.env.STORAGE_PROVIDER = 's3';
process.env.AWS_REGION = 'eu-west-1';
process.env.AWS_S3_BUCKET = 'vrt-test-bucket';
process.env.AWS_ACCESS_KEY_ID = 'AKIATESTTESTTESTTEST';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key-not-real';
process.env.AWS_S3_FORCE_PATH_STYLE = 'true';
// AWS_S3_ENDPOINT is set at runtime by startFakeS3() once the fake server has a port.
