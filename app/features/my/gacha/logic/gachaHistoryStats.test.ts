import { describe, expect, it } from 'vitest';
import {
  calculateGachaHistoryStats,
  calculateGachaHistoryStatsByBanner,
  calculateTopRecruitedStudentGroups,
  isValidGachaHistorySimulationCount,
  shouldAutoRunGachaHistorySimulation,
} from './gachaHistoryStats';
import type { BannerPeriod } from '../../../../utils/gachaData';
import type { GachaHistoryEntry } from '~/types/gachaHistory';

const banner: BannerPeriod = {
  id: 'test',
  startTime: '2026-01-01 11:00',
  endTime: '2026-01-15 10:59',
  bannerType: '',
  isFes: false,
  isLimitedBanner: true,
  isRerunBanner: false,
  isRecall: false,
  freePulls: 0,
  useChargeSystem: true,
  pickupStudents: [{ id: 1, name: 'Test', isLimited: true, isFes: false, isRerun: false, isRecall: false }],
};

function makeEntry(): GachaHistoryEntry {
  return {
    id: 'entry',
    bannerId: 'GL:test',
    server: 'GL',
    date: '2026-01-01',
    pullCount: 100,
    initialCharge: 0,
    results: [
      { id: 'normal', studentId: 2, isFirstAcquisition: false, isPickup: false, countTowardGoal: false, source: 'normal' },
      { id: 'half', studentId: 1, isFirstAcquisition: true, isPickup: true, countTowardGoal: true, source: 'half_pity' },
      { id: 'exchange', studentId: 1, isFirstAcquisition: false, isPickup: true, countTowardGoal: true, source: 'point_exchange' },
    ],
  };
}

describe('calculateGachaHistoryStats', () => {
  it('excludes guaranteed and exchange results from normal three-star statistics', () => {
    const stats = calculateGachaHistoryStats([makeEntry()], new Map([['GL:test', banner]]));
    expect(stats.eligiblePulls).toBe(99);
    expect(stats.normalThreeStars).toBe(1);
    expect(stats.halfPityCount).toBe(1);
    expect(stats.halfPityPickupCount).toBe(1);
  });

  it('uses the exact binomial distribution for a single half-pity result', () => {
    const stats = calculateGachaHistoryStats([makeEntry()], new Map([['GL:test', banner]]));

    expect(stats.halfPity?.points).toEqual([
      { value: 0, probability: 0.5 },
      { value: 1, probability: 0.5 },
    ]);
    expect(stats.halfPity?.topPercentMin).toBe(0.1);
    expect(stats.halfPity?.topPercentMax).toBe(50);
  });

  it('counts selected target students once for the cumulative goal comparison', () => {
    const stats = calculateGachaHistoryStats([makeEntry()], new Map([['GL:test', banner]]));
    expect(stats.goalCount).toBe(1);
    expect(stats.goals?.actual).toBe(100);
    expect(stats.goals?.actualPointValue).toBe(100);
    expect(stats.goals?.pointWidth).toBe(10);
    expect(stats.goals?.median).toBeTypeOf('number');
  });

  it('simulates the normal and limited pickups on independent charge counters for a concurrent banner', () => {
    // Banner runs a limited pickup (id 1) and a normal pickup (id 2) at once; both counters start at 199,
    // so each pity is one pull away. A shared single counter would reset after the first and need ~199
    // more for the second — this asserts the two are independent.
    const mixedBanner: BannerPeriod = {
      ...banner,
      isLimitedBanner: true,
      pickupStudents: [
        { id: 1, name: 'Limited', isLimited: true, isFes: false, isRerun: false, isRecall: false },
        { id: 2, name: 'Standard', isLimited: false, isFes: false, isRerun: false, isRecall: false },
      ],
    };
    const entry: GachaHistoryEntry = {
      id: 'entry',
      bannerId: 'GL:test',
      server: 'GL',
      date: '2026-01-01',
      pullCount: 20,
      initialCharge: 199, // normal counter
      initialChargeLimited: 199, // limited counter
      results: [
        { id: 'n', studentId: 2, isFirstAcquisition: true, isPickup: true, countTowardGoal: true, source: 'hard_pity' },
        { id: 'l', studentId: 1, isFirstAcquisition: true, isPickup: true, countTowardGoal: true, source: 'hard_pity' },
      ],
    };
    const stats = calculateGachaHistoryStats([entry], new Map([['GL:test', mixedBanner]]));
    expect(stats.goalCount).toBe(2);
    // Both pities are ~1 pull away on their own counter → expected total ≈ 2, far below the ~200 a shared
    // counter would produce.
    expect(stats.goals?.expected).toBeLessThan(10);
  });
});

describe('calculateGachaHistoryStatsByBanner', () => {
  it('combines multiple records from the same banner', () => {
    const first = makeEntry();
    const second = { ...makeEntry(), id: 'entry-2', date: '2026-01-02' };
    const result = calculateGachaHistoryStatsByBanner([first, second], new Map([['GL:test', banner]]), 100);

    expect(result).toHaveLength(1);
    expect(result[0]?.bannerId).toBe('GL:test');
    expect(result[0]?.stats.eligiblePulls).toBe(198);
    expect(result[0]?.stats.normalThreeStars).toBe(2);
    expect(result[0]?.stats.halfPityCount).toBe(2);
    expect(result[0]?.stats.goalCount).toBe(2);
  });

  it('keeps banners separate, sorts them chronologically, and skips unknown banners', () => {
    const earlierBanner = { ...banner, id: 'earlier', startTime: '2025-12-01 11:00' };
    const entries = [makeEntry(), { ...makeEntry(), id: 'earlier-entry', bannerId: 'JP:earlier', server: 'JP' as const }, { ...makeEntry(), id: 'unknown-entry', bannerId: 'GL:unknown' }];
    const result = calculateGachaHistoryStatsByBanner(
      entries,
      new Map([
        ['GL:test', banner],
        ['JP:earlier', earlierBanner],
      ]),
      100,
    );

    expect(result.map((item) => item.bannerId)).toEqual(['JP:earlier', 'GL:test']);
  });
});

describe('gacha history simulation count', () => {
  it('auto-runs only valid counts below the default', () => {
    expect(shouldAutoRunGachaHistorySimulation(9_999)).toBe(true);
    expect(shouldAutoRunGachaHistorySimulation(10_000)).toBe(false);
    expect(shouldAutoRunGachaHistorySimulation(100_000)).toBe(false);
    expect(shouldAutoRunGachaHistorySimulation(99)).toBe(false);
  });

  it('accepts the configured simulation count limits', () => {
    expect(isValidGachaHistorySimulationCount(100)).toBe(true);
    expect(isValidGachaHistorySimulationCount(100_000)).toBe(true);
    expect(isValidGachaHistorySimulationCount(100.5)).toBe(false);
    expect(isValidGachaHistorySimulationCount(100_001)).toBe(false);
  });
});

describe('calculateTopRecruitedStudentGroups', () => {
  it('counts every recorded acquisition in all mode', () => {
    expect(calculateTopRecruitedStudentGroups([makeEntry()], 'all')).toEqual([{ studentIds: [1], count: 2 }]);
  });

  it('excludes students recruited only once', () => {
    expect(calculateTopRecruitedStudentGroups([makeEntry()], 'normal')).toEqual([]);
  });

  it('returns every student in the top three distinct count groups', () => {
    const tiedEntry = makeEntry();
    tiedEntry.results = [
      ...Array.from({ length: 4 }, (_, index) => ({ id: `a-${index}`, studentId: 4, isFirstAcquisition: false, isPickup: false, countTowardGoal: false, source: 'normal' as const })),
      ...Array.from({ length: 4 }, (_, index) => ({ id: `b-${index}`, studentId: 2, isFirstAcquisition: false, isPickup: false, countTowardGoal: false, source: 'normal' as const })),
      ...Array.from({ length: 3 }, (_, index) => ({ id: `c-${index}`, studentId: 6, isFirstAcquisition: false, isPickup: false, countTowardGoal: false, source: 'normal' as const })),
      ...Array.from({ length: 2 }, (_, index) => ({ id: `d-${index}`, studentId: 8, isFirstAcquisition: false, isPickup: false, countTowardGoal: false, source: 'normal' as const })),
      ...Array.from({ length: 2 }, (_, index) => ({ id: `e-${index}`, studentId: 7, isFirstAcquisition: false, isPickup: false, countTowardGoal: false, source: 'normal' as const })),
      { id: 'single', studentId: 1, isFirstAcquisition: false, isPickup: false, countTowardGoal: false, source: 'normal' },
    ];

    expect(calculateTopRecruitedStudentGroups([tiedEntry], 'all')).toEqual([
      { studentIds: [2, 4], count: 4 },
      { studentIds: [6], count: 3 },
      { studentIds: [7, 8], count: 2 },
    ]);
    expect(calculateTopRecruitedStudentGroups([], 'all')).toEqual([]);
  });
});
