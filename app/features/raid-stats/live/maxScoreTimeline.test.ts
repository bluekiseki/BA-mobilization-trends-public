import { describe, expect, it } from 'vitest';
import { findMaxScoresByDifficulty, findMaxTotalScore } from './maxScoreTimeline';

const raid = { Id: 'E38' };

describe.each([true, false])('highest scores with hideAbnormal=%s', (hideAbnormal) => {
  it.each([2, 990])('does not treat rank %i as the overall top when rank 1 is missing', (rank) => {
    const entries = [{ r: rank, s: 39829679 }];
    expect(findMaxScoresByDifficulty(entries, raid, 'jp', hideAbnormal)).toEqual({});
    expect(findMaxTotalScore(entries, hideAbnormal)).toBeNull();
  });

  it('retains a verified lower difficulty when the overall top is missing', () => {
    const entries = [
      { r: 990, s: 39829679 },
      { r: 1200, s: 38000000 },
      { r: 1201, s: 27700000 },
    ];
    expect(findMaxScoresByDifficulty(entries, raid, 'jp', hideAbnormal)).toEqual({ Insane: 27700000 });
  });

  it('accepts rank 1 after sorting without mutating the input', () => {
    const entries = [
      { r: 1000, s: 39800000 },
      { r: 1, s: 40000000 },
    ];
    expect(findMaxScoresByDifficulty(entries, raid, 'jp', hideAbnormal)).toEqual({ Torment: 40000000 });
    expect(findMaxTotalScore(entries, hideAbnormal)).toBe(40000000);
    expect(entries[0].r).toBe(1000);
  });
});

describe('hidden abnormal records', () => {
  it('uses the first unflagged record in consecutive ranks', () => {
    const entries = [
      { r: 1, s: 40348000, h: true },
      { r: 2, s: 40347000, h: true },
      { r: 3, s: 40000000 },
    ];
    expect(findMaxScoresByDifficulty(entries, raid, 'jp', true)).toEqual({ Torment: 40000000 });
    expect(findMaxTotalScore(entries, true)).toBe(40000000);
  });

  it('does not skip missing ranks to replace a flagged top', () => {
    const entries = [
      { r: 1, s: 40348000, h: true },
      { r: 990, s: 39829679 },
    ];
    expect(findMaxScoresByDifficulty(entries, raid, 'jp', true)).toEqual({});
    expect(findMaxTotalScore(entries, true)).toBeNull();
    expect(findMaxScoresByDifficulty(entries, raid, 'jp', false)).toEqual({ Torment: 40348000 });
    expect(findMaxTotalScore(entries, false)).toBe(40348000);
  });

  it('keeps the next difficulty separate when all higher difficulty records are flagged', () => {
    const entries = [
      { r: 1, s: 40348000, h: true },
      { r: 2, s: 27700000 },
    ];
    expect(findMaxScoresByDifficulty(entries, raid, 'jp', true)).toEqual({ Insane: 27700000 });
  });

  it('does not infer a lower difficulty top across missing boundary ranks', () => {
    const entries = [
      { r: 1, s: 40000000 },
      { r: 1000, s: 27700000 },
    ];
    expect(findMaxScoresByDifficulty(entries, raid, 'jp', true)).toEqual({ Torment: 40000000 });
  });

  it('retains genuine decreases in a verified lower difficulty top', () => {
    const snapshot = (score: number) => [
      { r: 1, s: 40000000 },
      { r: 1000, s: 38000000 },
      { r: 1001, s: score },
    ];
    expect(findMaxScoresByDifficulty(snapshot(27770817), raid, 'jp', true).Insane).toBe(27770817);
    expect(findMaxScoresByDifficulty(snapshot(27765504), raid, 'jp', true).Insane).toBe(27765504);
  });

  it('returns no top for empty or entirely flagged samples', () => {
    expect(findMaxScoresByDifficulty([], raid, 'jp', true)).toEqual({});
    expect(findMaxTotalScore([], true)).toBeNull();
    expect(findMaxTotalScore(undefined, true)).toBeNull();
    const entries = [{ r: 1, s: 40348000, h: true }];
    expect(findMaxScoresByDifficulty(entries, raid, 'jp', true)).toEqual({});
    expect(findMaxTotalScore(entries, true)).toBeNull();
  });
});
