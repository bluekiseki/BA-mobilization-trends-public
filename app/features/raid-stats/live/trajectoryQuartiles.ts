// Interquartile range of the past-season platinum-cut trajectories at a given time remaining.

export interface RankPoint {
  hour_remaining: number;
  rank: number;
}

// Fewer seasons than this make a quartile meaningless.
const MIN_SERIES = 4;

/** Linearly interpolate a season's rank at `hours`; null when the season does not cover that time. */
export function interpolateRank(points: readonly RankPoint[], hours: number): number | null {
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (hours < first.hour_remaining || hours > last.hour_remaining) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.hour_remaining <= hours && hours <= b.hour_remaining) {
      return b.hour_remaining === a.hour_remaining ? a.rank : a.rank + ((b.rank - a.rank) * (hours - a.hour_remaining)) / (b.hour_remaining - a.hour_remaining);
    }
  }
  return null;
}

/** Percentile with linear interpolation between order statistics (`p` in 0..1, `sorted` ascending). */
function percentile(sorted: readonly number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** 25% / 75% of the per-season ranks at `hours`, or null with too few seasons covering that time. */
export function quartileRanks(series: ReadonlyArray<readonly RankPoint[]>, hours: number): { q1: number; q3: number } | null {
  const ranks = series.map((points) => interpolateRank(points, hours)).filter((rank): rank is number => rank !== null);
  if (ranks.length < MIN_SERIES) return null;
  ranks.sort((a, b) => a - b);
  return { q1: percentile(ranks, 0.25), q3: percentile(ranks, 0.75) };
}
