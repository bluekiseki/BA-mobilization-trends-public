export const parseTier = (raw: string, max: number): number | null => {
  const cleaned = raw.trim().toUpperCase();
  if (!cleaned.startsWith('T')) return null;
  const digits = cleaned
    .slice(1)
    .replace(/D/g, '1')
    .split('')
    .filter((character) => /\d/.test(character))
    .join('');
  if (!digits) return null;
  const tier = Number(digits);
  return tier >= 1 && tier <= max ? tier : null;
};
