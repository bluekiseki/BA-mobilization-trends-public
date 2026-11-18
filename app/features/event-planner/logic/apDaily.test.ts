import { describe, it, expect } from 'vitest';
import { computeDailyAp, buildApTimeline, dateReachingAp } from '~/features/event-planner/logic/apDaily';
import type { ApCalculatorConfig } from '~/types/minigame/apCalculator';

// Hand-computed: 2026-01-01 (Thu) 00:00 .. 2026-01-03 (Sat) 00:00, no cafe/gem/hard-mode, bonus 100.
//   day 1 (first day, full): 1440 min / 6 = 240 natural + 170 daily quests            = 410
//   day 2 (Fri, middle):     240 natural + 170 daily quests + 200 weekly (Friday)     = 610
//   day 3 (last day, 00:00): 0 natural + 170 daily quests                             = 170
const config: ApCalculatorConfig = {
  startDate: '2026-01-01T00:00',
  endDate: '2026-01-03T00:00',
  cafeRank: 0,
  gemRefills: 0,
  pvpRefills: 0,
  hardStages: 0,
  exchangeRuns: 0,
  exchangeCost: 15,
  miscDailySpend: 0,
  attendanceStartDate: '2026-01-01',
  attendanceStartDay: 0,
  bonusAp: 100,
  apPackageDates: [],
};

describe('computeDailyAp', () => {
  it('matches the hand-computed per-day and total AP', () => {
    const result = computeDailyAp(config);
    expect(Object.entries(result.daily).map(([date, d]) => [date, d.total])).toEqual([
      ['2026-01-01', 410],
      ['2026-01-02', 610],
      ['2026-01-03', 170],
    ]);
    expect(result.total).toBe(100 + 410 + 610 + 170);
  });

  it('builds a cumulative timeline that ends at the calculator total and finds the reaching date', () => {
    const result = computeDailyAp(config);
    const timeline = buildApTimeline(result, config.bonusAp);
    expect(timeline.map((e) => e.cumulativeAp)).toEqual([510, 1120, 1290]);
    expect(timeline[timeline.length - 1].cumulativeAp).toBe(result.total);
    expect(dateReachingAp(timeline, 510)).toBe('2026-01-01');
    expect(dateReachingAp(timeline, 511)).toBe('2026-01-02');
    expect(dateReachingAp(timeline, 1291)).toBeNull();
  });
});
