// OOParts are Item_<series base + tier>: the base is a multiple of 10 in 100..290 and the tier is 0..3.
// Verified against icon_info.json on 2026-11-01 — every series has exactly four tiers.
export const OPART_TIERS = [0, 1, 2, 3] as const;

export type OpartTier = (typeof OPART_TIERS)[number];

export function getOpartSeriesBase(id: number): number {
  return Math.floor(id / 10) * 10;
}

export function getOpartItemKey(seriesBase: number, tier: OpartTier): string {
  return `Item_${seriesBase + tier}`;
}

/** Distinct series bases (ascending) for the given OOPart item ids. */
export function listOpartSeriesBases(ids: number[]): number[] {
  return [...new Set(ids.map(getOpartSeriesBase))].sort((a, b) => a - b);
}
