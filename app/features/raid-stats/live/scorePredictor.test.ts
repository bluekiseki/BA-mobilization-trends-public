import { describe, expect, it } from 'vitest';
import { curveFromEntries, predictScoreCut, rankAtScore, scoreAtRank, type Curve, type ScoreModel } from './scorePredictor';

// Linear curve: rank r has score 1_000_000 - 40 * r (ranks 1..20000 on a 1000 grid).
const linear = (offset: number): Curve => curveFromEntries([1, 1000, 5000, 10000, 20000, 40000].map((r) => ({ r, s: 1_000_000 - 40 * r + offset })));

const model = (overrides: Partial<ScoreModel> = {}): ScoreModel => ({
  version: 1,
  generatedAt: '2026-01-01T00:00:00Z',
  trainSeasons: [1],
  targetRank: 20000,
  cap: 0.35,
  lagHours: [12],
  hGrid: { min: 1, max: 10, step: 1 },
  baselineR: Array.from({ length: 10 }, () => 18000),
  lags: { '12': Array.from({ length: 10 }, () => [-1, Math.log(18000), 0.1, 0, 1] as const) },
  p80: [
    [3, 400],
    [9, 800],
  ],
  ...overrides,
});

describe('curve interpolation', () => {
  it('round-trips score and rank', () => {
    const c = linear(0);
    expect(scoreAtRank(c, 7500)).toBeCloseTo(1_000_000 - 40 * 7500);
    expect(rankAtScore(c, scoreAtRank(c, 7500))).toBeCloseTo(7500);
  });

  it('clamps outside the curve', () => {
    const c = linear(0);
    expect(scoreAtRank(c, 0)).toBe(c[0][1]);
    expect(rankAtScore(c, -1e9)).toBe(40000);
  });
});

describe('predictScoreCut', () => {
  it('treats a negative psi as invalid and falls back to the baseline for that lag', () => {
    // The past curve is 200_000 points higher, so the current 20000th score was rank 25000 back then (worse than now).
    const snapshots = [
      { hoursRemaining: 5, getCurve: () => linear(0) },
      { hoursRemaining: 17, getCurve: () => linear(200_000) },
    ];
    const p = predictScoreCut(model(), snapshots, 5);
    expect(p?.perLag[12]).toBeCloseTo(18000);
    expect(p?.rank).toBeCloseTo(18000);
    expect(p?.score).toBeCloseTo(scoreAtRank(linear(0), 18000));
  });

  it('uses psi when valid and clips the feature to the training range', () => {
    // Past curve is lower by 80_000 -> that score was at a better (smaller) rank before: rank 18000.
    const snapshots = [
      { hoursRemaining: 5, getCurve: () => linear(0) },
      { hoursRemaining: 17, getCurve: () => linear(-80_000) },
    ];
    const p = predictScoreCut(model(), snapshots, 5);
    const feature = Math.log(20000 / rankAtScore(linear(-80_000), scoreAtRank(linear(0), 20000)));
    const expected = Math.exp(Math.log(18000) - 1 * (Math.min(1, Math.max(0, feature)) - 0.1));
    expect(p?.perLag[12]).toBeCloseTo(Math.max(18000 * 0.65, Math.min(18000 * 1.35, expected)));
  });

  it('falls back to the baseline when the lag snapshot is missing', () => {
    const p = predictScoreCut(model(), [{ hoursRemaining: 5, getCurve: () => linear(0) }], 5);
    expect(p?.rank).toBeCloseTo(18000);
  });

  it('interpolates the 80% band and rejects hours outside the grid', () => {
    const snapshots = [{ hoursRemaining: 6, getCurve: () => linear(0) }];
    expect(predictScoreCut(model(), snapshots, 6)?.p80).toBeCloseTo(600);
    expect(predictScoreCut(model(), snapshots, 50)).toBeNull();
  });
});
