// Login returns to the requested Director page, regardless of account role.
export function directorAuthReturn(value) {
  const path = String(value || '/app').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || [...path].some(c => c.charCodeAt(0) < 32)) return '/app';
  return path;
}
