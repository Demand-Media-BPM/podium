const { S3Client } = require('@aws-sdk/client-s3');
const config = require('./env');

// Builds the AWS SDK v3 S3 client.
//
// Credentials are NOT passed here. The SDK resolves them through its default provider chain:
//   1. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY environment variables (local development)
//   2. a shared AWS profile (~/.aws/credentials, AWS_PROFILE)
//   3. the IAM role attached to the EC2 instance (production - no long-term keys on the server)
// so no secret ever appears in this code base or in the React app.
//
// `credentials` can be supplied only by automated tests. `endpoint` is for a local S3-compatible server in
// development/testing; configuration validation refuses it in production.
function createS3Client(s3Config = config.s3) {
  const options = {
    region: s3Config.region,
    // Only add checksum headers when an operation requires them: keeps requests simple and portable.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
  if (s3Config.endpoint) {
    options.endpoint = s3Config.endpoint;
    options.forcePathStyle = Boolean(s3Config.forcePathStyle);
  }
  if (s3Config.credentials) options.credentials = s3Config.credentials;
  return new S3Client(options);
}

let sharedClient = null;

function getS3Client() {
  if (!sharedClient) sharedClient = createS3Client();
  return sharedClient;
}

function resetS3Client() {
  if (sharedClient) sharedClient.destroy();
  sharedClient = null;
}

function isS3Configured() {
  return Boolean(config.s3.region && config.s3.bucket);
}

module.exports = { createS3Client, getS3Client, resetS3Client, isS3Configured };
