import { describe, expect, it } from 'vitest';
import { aggregateCombinationHistogram, aggregateCombinations, scoresSha256, validateCombinationIndex } from './eraidAnalysis';
import { orderedCombination, getBracketFromTotalScore, getDifficultyFromScoreAndBoss, isNeedOldVersion } from '../../../utils/difficultyPolicy';
import type { ERaidCombinationIndexV1 } from './types/eraidAnalysis';

describe('existing score policy compatibility', () => {
  it('preserves total-assault version boundaries and the current E-season policy', () => {
    expect([isNeedOldVersion('jp', 'R47'), isNeedOldVersion('jp', 'R48'), isNeedOldVersion('kr', 'R43'), isNeedOldVersion('kr', 'R44'), isNeedOldVersion('jp', 'E7')]).toEqual([
      true,
      false,
      true,
      false,
      false,
    ]);
    expect(getDifficultyFromScoreAndBoss(28_841_360, 'jp', 'E7')).toBe('Insane');
    expect(getDifficultyFromScoreAndBoss(15_633_121, 'jp', 'E7')).toBe('Extreme');
    expect(getDifficultyFromScoreAndBoss(28_000_000, 'jp', 'R47')).toBe('Torment');
    expect(getDifficultyFromScoreAndBoss(28_999_999, 'jp', 'E37')).toBe('Insane');
    expect(getDifficultyFromScoreAndBoss(29_000_000, 'jp', 'E37')).toBe('Torment');
    expect(getDifficultyFromScoreAndBoss(15_759_999, 'jp', 'E37')).toBe('Extreme');
    expect(getDifficultyFromScoreAndBoss(15_760_000, 'jp', 'E37')).toBe('Insane');
  });
  it('preserves legacy total brackets, distinct Hard letters, and incomplete profiles', () => {
    expect([83_999_999, 84_000_000, 96_999_999, 97_000_000].map(getBracketFromTotalScore)).toEqual(['III', 'TII', 'TII', 'TTI']);
    expect(orderedCombination(['Insane', null, 'Extreme'])).toBe('I_E');
    expect(orderedCombination(['Torment', 'Torment', 'Insane'])).toBe('TTI');
    expect(orderedCombination(['Torment', 'Insane', 'Torment'])).toBe('TIT');
    expect(orderedCombination(['Hard', 'Hardcore', 'Extreme'])).toBe('AHE');
  });
});

describe('linked index and aggregate statistics', () => {
  const tierCounter = { '4': 1, '3': 1, '2': 1, '1': 1 };
  const built = {
    totals: Int32Array.from([30, 30, 20, 10]),
    index: {
      schemaVersion: 1,
      server: 'jp',
      season: 'E1',
      armorTypes: ['LightArmor', 'HeavyArmor', 'Unarmed'],
      baseScoresSha256: 'e955cd0b18ad95d9a4f4bd4b6314d0d94cc6c4dfcd2dcf775b3e0dfd5df73e95',
      profiles: [
        ['Normal', 'Normal', 'Normal'],
        ['Normal', null, null],
      ],
      profileIds: [0, 1, 1, 1],
    } satisfies ERaidCombinationIndexV1,
  };
  it('hashes the score array as signed int32 little-endian', async () => {
    expect(await scoresSha256(built.totals)).toBe(built.index.baseScoresSha256);
  });
  it('keeps partially known records as combinations with "_" and filters tier intersections', () => {
    const ids = Uint16Array.from(built.index.profileIds);
    const result = aggregateCombinations(built.totals, ids, built.index.profiles, tierCounter, { tier: null, bracket: null });
    expect(result.summary).toEqual({ recordCount: 4, combinationCount: 2 });
    const filtered = aggregateCombinations(built.totals, ids, built.index.profiles, tierCounter, { tier: 'Gold', bracket: 'Other' });
    expect(filtered.summary).toEqual({ recordCount: 1, combinationCount: 1 });
    const empty = aggregateCombinations(built.totals, ids, built.index.profiles, tierCounter, { tier: null, bracket: 'TII' });
    expect(empty.summary.recordCount).toBe(0);
  });
  it('rejects cross-season files, invalid dictionary IDs and malformed profiles', () => {
    expect(validateCombinationIndex(built.index, 'jp', 'E1', 4)).toBe(built.index);
    expect(() => validateCombinationIndex(built.index, 'jp', 'E2', 4)).toThrow();
    expect(() => validateCombinationIndex({ ...built.index, profileIds: [999, 0, 0, 0] }, 'jp', 'E1', 4)).toThrow();
    expect(() => validateCombinationIndex({ ...built.index, profiles: [['Normal']] }, 'jp', 'E1', 4)).toThrow();
  });
  it('keeps TTI/TIT counts and selected histogram bins separate', () => {
    const profiles: ERaidCombinationIndexV1['profiles'] = [
      ['Torment', 'Torment', 'Insane'],
      ['Torment', 'Insane', 'Torment'],
    ];
    const scores = Int32Array.from([100, 90]),
      ids = Uint16Array.from([0, 1]);
    const result = aggregateCombinations(scores, ids, profiles, { '4': 1, '3': 1 }, { tier: null, bracket: null });
    expect(result.combinations.map((c) => c.combination)).toEqual(['TTI', 'TIT']);
    const query = {
      combination: 'TIT',
      tier: null,
      bracket: null,
      rankMin: 1,
      rankMax: 2,
      scoreMin: 0,
      scoreMax: 200,
      useScoreFilter: false,
      binSize: 10,
      baseScore: 0,
      visibleBrackets: ['Other'],
    } as const;
    const histogram = aggregateCombinationHistogram(scores, ids, profiles, { '4': 1, '3': 1 }, { ...query, visibleBrackets: [...query.visibleBrackets] });
    expect(histogram).toEqual({ combination: 'TIT', matchedCount: 1, bins: [{ binStart: 90, count: 1, scoreMin: 90, scoreMax: 90, rankMin: 2, rankMax: 2 }] });
    expect(aggregateCombinationHistogram(scores, ids, profiles, { '4': 1, '3': 1 }, { ...query, tier: 'Platinum', visibleBrackets: [...query.visibleBrackets] }).matchedCount).toBe(0);
  });
});
