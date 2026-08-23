import { describe, expect, it } from 'vitest';
import { calculatePyroxeneTimeline, type PlannerSchedule, type PyroxeneConfig } from './pyroxeneCalc';

const baseConfig: PyroxeneConfig = {
  currentPyroxene: 0,
  monthlyCard: false,
  halfMonthlyCard: false,
  monthlyPackCost: 0,
  monthlyExtraGem: 0,
  apRefreshes_normal: 0,
  apRefreshes_event: 0,
  raidRank: 'platinum',
  pvpRankTier: 100,
};

describe('calculatePyroxeneTimeline main story rewards', () => {
  it('adds only selected past main story rewards on the first day', () => {
    const schedules: PlannerSchedule[] = [
      { id: 'cleared', name: 'Cleared story', start: '2026-01-01', end: '2026-01-01', type: 'MainStory', amount: 100 },
      { id: 'unclaimed', name: 'Unclaimed story', start: '2026-01-02', end: '2026-01-02', type: 'MainStory', amount: 200 },
    ];

    const result = calculatePyroxeneTimeline({ ...baseConfig, selectedMainStoryIds: ['unclaimed'] }, schedules, { simulationDays: 1 });
    const mainStoryLogs = result.timeline[0].logs.filter((log) => log.i18nKey === 'log.mainstory');

    expect(mainStoryLogs).toEqual([{ i18nKey: 'log.mainstory', params: { name: 'Unclaimed story' }, amount: 200 }]);
  });
});
