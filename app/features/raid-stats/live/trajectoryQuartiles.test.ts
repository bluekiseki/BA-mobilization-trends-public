import { describe, expect, it } from 'vitest';
import { interpolateRank, quartileRanks, type RankPoint } from './trajectoryQuartiles';

const line = (start: number, end: number): RankPoint[] => [
  { hour_remaining: 0, rank: 20000 },
  { hour_remaining: 10, rank: start },
  { hour_remaining: 20, rank: end },
];

describe('interpolateRank', () => {
  it('interpolates between neighbouring points', () => {
    expect(interpolateRank(line(10000, 2000), 5)).toBeCloseTo(15000);
    expect(interpolateRank(line(10000, 2000), 15)).toBeCloseTo(6000);
  });

  it('returns null outside the covered time', () => {
    expect(interpolateRank(line(10000, 2000), 25)).toBeNull();
    expect(interpolateRank([], 1)).toBeNull();
  });
});

describe('quartileRanks', () => {
  it('takes the 25% and 75% of the per-season ranks', () => {
    // At 10h the five seasons sit at 1000, 2000, 3000, 4000, 5000.
    const series = [1000, 2000, 3000, 4000, 5000].map((rank) => line(rank, 0));
    expect(quartileRanks(series, 10)).toEqual({ q1: 2000, q3: 4000 });
  });

  it('ignores seasons that do not cover the time and needs at least four', () => {
    const short: RankPoint[] = [
      { hour_remaining: 0, rank: 20000 },
      { hour_remaining: 5, rank: 15000 },
    ];
    const series = [1000, 2000, 3000].map((rank) => line(rank, 0));
    expect(quartileRanks([...series, short], 10)).toBeNull();
  });
});
