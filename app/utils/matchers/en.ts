export default function match(target: string, query: string): boolean {
  // Remove spaces and periods from target for comparison
  const normalizedTarget = target.trim().toLowerCase().replace(/[\s.]/g, '');

  // Split query by spaces and periods, filter out empty strings
  const keywords = query
    .trim()
    .toLowerCase()
    .split(/[\s.]+/)
    .filter(Boolean);

  // All keywords must be present in the normalized target
  return keywords.every((keyword) => normalizedTarget.includes(keyword));
}
