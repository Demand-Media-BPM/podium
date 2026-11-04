const DEFAULT_DESTINATION = '/dashboard';

// Only same-app employee pages are valid post-login destinations. This blocks open redirects
// such as "//evil.example", "https://evil.example" or "/\\evil.example".
const ALLOWED_PREFIXES = ['/dashboard', '/requests'];

export function getSafeRedirect(target) {
  if (typeof target !== 'string') return DEFAULT_DESTINATION;
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return DEFAULT_DESTINATION;

  const path = target.split(/[?#]/)[0];
  const allowed = ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return allowed ? target : DEFAULT_DESTINATION;
}

export { DEFAULT_DESTINATION };
