const path = require('path');
const dotenv = require('dotenv');

// Load variables from backend/.env (if present) into process.env.
// Variables that are already set in the real environment are never overridden.
dotenv.config({ quiet: true });

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours
const DEFAULT_DB_NAME = 'video_response_tool';
const MIN_JWT_SECRET_LENGTH = 32;

const BACKEND_ROOT = path.resolve(__dirname, '..');
const FRONTEND_ROOT = path.resolve(BACKEND_ROOT, '..', 'frontend');
const DEFAULT_UPLOAD_DIR = 'storage/uploads';
// Long question answers may be up to 2 GiB. Empty or near-empty files are refused.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const MIN_UPLOAD_BYTES = 1024;
const RESPONSE_RETENTION_DAYS = 180;

const STORAGE_PROVIDERS = ['s3', 'local'];
const HOUR_MS = 60 * 60 * 1000;
// Region ids look like us-east-1, eu-west-2, ap-southeast-1, us-gov-west-1.
const AWS_REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d$/;
// General-purpose bucket naming rules (3-63 characters, lowercase letters, numbers, dots, hyphens).
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function parseOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Pure function so it can be unit tested with arbitrary environments.
function buildConfig(env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const frontendUrl = (env.FRONTEND_URL || 'http://localhost:5173').trim();
  const trustProxyHops = Number(env.TRUST_PROXY);
  // Base URL used to build the shareable client links. Defaults to the frontend origin.
  const publicBaseSetting = (env.PUBLIC_BASE_URL || '').trim();

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number(env.PORT) || 5000,
    frontendUrl,
    // Origins allowed by CORS and by the CSRF origin check.
    // The public link origin is included so clients opening a link from PUBLIC_BASE_URL can submit responses.
    trustedOrigins: [...new Set([parseOrigin(frontendUrl), parseOrigin(publicBaseSetting)].filter(Boolean))],
    // Origin (no trailing slash) that public links are built from, e.g. https://tool.example.com
    publicBaseUrl: parseOrigin(publicBaseSetting || frontendUrl),
    publicBaseUrlInvalid: Boolean(publicBaseSetting) && !parseOrigin(publicBaseSetting),
    // Number of reverse proxies in front of the API (e.g. 1 for nginx). Unset = none.
    trustProxy: Number.isInteger(trustProxyHops) && trustProxyHops > 0 ? trustProxyHops : null,
    mongodbUri: (env.MONGODB_URI || '').trim(),
    // The database name is fixed in code; MONGODB_DB_NAME exists so automated tests never touch real data.
    mongodbDbName: (env.MONGODB_DB_NAME || DEFAULT_DB_NAME).trim(),
    jwtSecret: env.JWT_SECRET || '',
    // Phase 4: temporary LOCAL video storage for development. Replaced by a private S3 bucket in Phase 5.
    upload: {
      dir: path.resolve(BACKEND_ROOT, (env.UPLOAD_DIR || '').trim() || DEFAULT_UPLOAD_DIR),
      maxBytes: MAX_UPLOAD_BYTES,
      minBytes: MIN_UPLOAD_BYTES,
      retentionDays: RESPONSE_RETENTION_DAYS,
    },
    // Phase 5: where videos are stored. 's3' (default, required in production) or 'local' (development only).
    storage: { provider: (env.STORAGE_PROVIDER || 's3').trim().toLowerCase() },
    // AWS credentials are deliberately NOT read here: the AWS SDK finds them itself through its standard provider
    // chain (environment variables, shared profile, or the EC2 instance role). Only presence flags are kept so
    // configuration mistakes can be reported without ever holding the secret values.
    s3: {
      region: (env.AWS_REGION || '').trim(),
      bucket: (env.AWS_S3_BUCKET || '').trim(),
      endpoint: (env.AWS_S3_ENDPOINT || '').trim(), // development/testing only (e.g. a local S3-compatible server)
      forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE === 'true',
      hasAccessKeyId: Boolean(env.AWS_ACCESS_KEY_ID),
      hasSecretAccessKey: Boolean(env.AWS_SECRET_ACCESS_KEY),
      pendingPrefix: 'pending/', // browser uploads land here; lifecycle deletes leftovers after 1 day
      finalPrefix: 'responses/', // verified videos live here; lifecycle expires them after 180 days
      uploadExpiresSeconds: 300, // presigned upload authorization lifetime
      playbackExpiresSeconds: 60, // presigned playback URL lifetime
      downloadExpiresSeconds: 60,
      pendingMaxAgeMs: 24 * HOUR_MS, // a pending upload older than this can no longer be completed
    },
    retention: {
      jobEnabled: (env.RETENTION_JOB || 'on').trim().toLowerCase() !== 'off',
      intervalMs: 6 * HOUR_MS,
      initialDelayMs: 60 * 1000,
    },
    session: {
      cookieName: 'vrt_session',
      maxAgeMs: SESSION_MAX_AGE_MS,
      jwtExpiresIn: '8h',
      issuer: 'video-response-tool',
      audience: 'video-response-tool-employees',
    },
  };
}

// Returns a list of problems (variable names only, never values).
function findStorageProblems(config) {
  const problems = [];
  const { provider } = config.storage;

  if (!STORAGE_PROVIDERS.includes(provider)) {
    problems.push('STORAGE_PROVIDER must be "s3" or "local"');
    return problems;
  }
  if (provider === 'local') {
    if (config.isProduction) {
      problems.push('STORAGE_PROVIDER=local is for development only and is not allowed when NODE_ENV=production');
    }
    return problems;
  }

  const s3 = config.s3;
  if (!s3.region) problems.push('AWS_REGION is not set (required when STORAGE_PROVIDER=s3)');
  else if (!AWS_REGION_PATTERN.test(s3.region)) problems.push('AWS_REGION is not a valid region such as eu-west-1');
  if (!s3.bucket) problems.push('AWS_S3_BUCKET is not set (required when STORAGE_PROVIDER=s3)');
  else if (!BUCKET_PATTERN.test(s3.bucket)) problems.push('AWS_S3_BUCKET is not a valid S3 bucket name');
  if (s3.hasAccessKeyId !== s3.hasSecretAccessKey) {
    problems.push('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together (or both left unset to use the AWS credential chain)');
  }
  if (s3.endpoint) {
    if (!parseOrigin(s3.endpoint)) problems.push('AWS_S3_ENDPOINT must be a valid URL');
    if (config.isProduction) problems.push('AWS_S3_ENDPOINT must not be set in production');
  }
  return problems;
}

function findConfigProblems(config, required = ['MONGODB_URI', 'JWT_SECRET', 'STORAGE']) {
  const problems = [];

  if (required.includes('STORAGE')) problems.push(...findStorageProblems(config));

  if (required.includes('MONGODB_URI')) {
    if (!config.mongodbUri) {
      problems.push('MONGODB_URI is not set');
    } else if (!/^mongodb(\+srv)?:\/\//.test(config.mongodbUri)) {
      problems.push('MONGODB_URI must start with mongodb:// or mongodb+srv://');
    }
    if (!/^[A-Za-z0-9_-]+$/.test(config.mongodbDbName)) {
      problems.push('MONGODB_DB_NAME may only contain letters, numbers, "_" and "-"');
    }
  }

  if (required.includes('JWT_SECRET')) {
    if (!config.jwtSecret) {
      problems.push('JWT_SECRET is not set');
    } else if (config.jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`);
    }
  }

  if (config.trustedOrigins.length === 0) {
    problems.push('FRONTEND_URL must be a valid URL such as http://localhost:5173');
  } else if (config.isProduction && !config.frontendUrl.startsWith('https://')) {
    problems.push('FRONTEND_URL must use https:// in production (session cookies are Secure)');
  }

  if (config.publicBaseUrlInvalid) {
    problems.push('PUBLIC_BASE_URL must be a valid URL such as https://tool.example.com');
  } else if (config.isProduction && config.publicBaseUrl && !config.publicBaseUrl.startsWith('https://')) {
    problems.push('PUBLIC_BASE_URL must use https:// in production');
  }

  // Uploaded videos must never live somewhere that is served to the public.
  if (isInside(FRONTEND_ROOT, config.upload.dir)) {
    problems.push('UPLOAD_DIR must not be inside the frontend directory');
  }
  if (path.parse(config.upload.dir).root === config.upload.dir) {
    problems.push('UPLOAD_DIR must not be a filesystem root');
  }

  return problems;
}

const config = buildConfig(process.env);

// Throws a descriptive error if required configuration is missing or invalid.
function validateEnv(required) {
  const problems = findConfigProblems(config, required);
  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
  }
}

module.exports = config;
module.exports.buildConfig = buildConfig;
module.exports.findConfigProblems = findConfigProblems;
module.exports.validateEnv = validateEnv;
module.exports.MIN_JWT_SECRET_LENGTH = MIN_JWT_SECRET_LENGTH;
