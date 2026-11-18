// Cumulative relationship-rank stat bonus, following SchaleDB's bracket rule:
// FavorStatValue[i] is the per-rank gain while moving through ranks 2-5, 6-10, 11-15, 16-20, 21-30, 31-40, 41-50.
export const FAVOR_BRACKET_END = [5, 10, 15, 20, 30, 40, 50];

/** Returns this student's cumulative relationship bonus; alternate outfits are not included. */
export function getFavorStatAt(values: number[][], rank: number): number[] {
  const total = values[0]?.map(() => 0) ?? [];
  for (let r = 2; r <= Math.min(rank, 50); r++) {
    const bracket = FAVOR_BRACKET_END.findIndex((end) => r <= end);
    values[bracket]?.forEach((v, i) => (total[i] += v));
  }
  return total;
}
