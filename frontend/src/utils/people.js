// Up to two capital letters for an avatar: "Erin Employee" -> "EE", "madonna" -> "M".
export function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function getFirstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}
