export function normalizeStageLabel(name: string): string | null {
  const m = name.match(/^CHAPTER(\d+)_(Hard|Normal)_Main_Stage(\d+)$/);
  if (!m) return null;
  return `${m[2]} ${parseInt(m[1])}-${parseInt(m[3])}`;
}
