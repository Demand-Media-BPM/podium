// Evaluates a presigned POST policy the way S3 does, so tests exercise the REAL policy the application generates.
// This is a test double: it checks the policy conditions but does NOT verify the cryptographic signature.

const FIELD_EXEMPT = new Set(['policy', 'x-amz-signature', 'file']);

const lower = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v]));

// Returns null when the upload is allowed, or { status, code, message } when S3 would refuse it.
function checkPostPolicy({ fields, fileSize, bucket, now = new Date() }) {
  const f = lower(fields);
  if (!f.policy) return { status: 403, code: 'AccessDenied', message: 'Missing policy' };

  let policy;
  try {
    policy = JSON.parse(Buffer.from(f.policy, 'base64').toString('utf8'));
  } catch {
    return { status: 400, code: 'InvalidPolicyDocument', message: 'Invalid policy' };
  }
  if (new Date(policy.expiration) < now) return { status: 403, code: 'ExpiredToken', message: 'Policy expired' };

  const covered = new Set();
  for (const condition of policy.conditions || []) {
    if (Array.isArray(condition)) {
      const [op, a, b, c] = condition;
      if (op === 'content-length-range') {
        if (fileSize < a || fileSize > b) {
          return { status: 400, code: fileSize > b ? 'EntityTooLarge' : 'EntityTooSmall', message: 'Size outside the allowed range' };
        }
      } else if (op === 'eq' || op === 'starts-with') {
        const name = String(a).replace(/^\$/, '').toLowerCase();
        covered.add(name);
        const actual = f[name];
        const ok = op === 'eq' ? actual === b : typeof actual === 'string' && actual.startsWith(b);
        if (!ok) return { status: 403, code: 'AccessDenied', message: `Policy condition failed: ${name}` };
      } else {
        return { status: 400, code: 'InvalidPolicyDocument', message: `Unsupported condition ${op}${c ?? ''}` };
      }
    } else {
      for (const [name, value] of Object.entries(condition)) {
        const n = name.toLowerCase();
        covered.add(n);
        const actual = n === 'bucket' ? bucket : f[n];
        if (actual !== value) return { status: 403, code: 'AccessDenied', message: `Policy condition failed: ${n}` };
      }
    }
  }

  // Every submitted form field must be covered by the policy (S3: "Each form field that you specify in a form must
  // appear in the list of conditions"). This is what stops a client from adding metadata or other headers.
  for (const name of Object.keys(f)) {
    if (FIELD_EXEMPT.has(name) || name.startsWith('x-ignore-')) continue;
    if (!covered.has(name)) return { status: 403, code: 'AccessDenied', message: `Extra form field not allowed: ${name}` };
  }
  if (!f.key) return { status: 400, code: 'InvalidArgument', message: 'Missing key' };
  return null;
}

module.exports = { checkPostPolicy };
