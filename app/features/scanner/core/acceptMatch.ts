// Mirrors the browser's `<input accept>` matching for the subset we use: comma-separated
// MIME prefixes like "image/*,video/*". A file matches when its type starts with any listed
// prefix. Files with an empty type (some containers report none, e.g. .mkv) are let through
// so a valid drop is never rejected outright.
export function acceptMatchesFile(accept: string, fileType: string): boolean {
  if (fileType === '') return true;
  const prefixes = accept.split(',').map((part) => part.trim().replace('*', ''));
  return prefixes.some((prefix) => prefix !== '' && fileType.startsWith(prefix));
}
