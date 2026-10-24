import type { ScanResult } from '~/features/scanner/core/types';

// Hex values of Tailwind green-400 / amber-400 / red-400, for canvas and SVG drawing where classes can't be used.
export const OVERLAY_GREEN = '#4ade80';
export const OVERLAY_AMBER = '#fbbf24';
export const OVERLAY_RED = '#f87171';

export const SIMILARITY_GOOD = 0.6;
export const SIMILARITY_FAIR = 0.5;

export function formatQty(n: number): string {
  if (n >= 1_000_000) return `×${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `×${Math.round(n / 1_000)}K`;
  return `×${n}`;
}

/** A video cell is trustworthy only when its frames agreed on kind and quantity and the icon match is strong. */
export function isConfidentVideoCell(r: ScanResult): boolean {
  return !!r.icon && r.videoStatus === 'confirmed' && r.similarity >= SIMILARITY_GOOD;
}
