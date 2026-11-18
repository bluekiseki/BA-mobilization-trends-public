import { describe, expect, it } from 'vitest';
import type { GrowthPlan } from '~/types/growthPlan';
import { matchesProgressFilter, progressValue } from './progressFilter';

const state = (level: number, star: number, uw: number, affection: number) => ({ level, star, uw, affection });
const plan = { current: state(85, 5, 0, 20), target: state(90, 5, 2, 50) } as unknown as GrowthPlan;

describe('progressFilter', () => {
  it('reads current and target separately', () => {
    expect(progressValue(plan, 'current', 'level')).toBe('80-89');
    expect(progressValue(plan, 'target', 'level')).toBe('90');
    expect(progressValue(plan, 'target', 'star')).toBe('8');
    expect(progressValue(plan, 'current', 'affection')).toBe('20-29');
  });
  it('requires every chosen field and a plan', () => {
    expect(matchesProgressFilter(plan, { tlevel: ['90'], taff: ['30-49', '50-99'] })).toBe(true);
    expect(matchesProgressFilter(plan, { clevel: ['90'] })).toBe(false);
    expect(matchesProgressFilter(undefined, { clevel: ['90'] })).toBe(false);
    expect(matchesProgressFilter(undefined, {})).toBe(true);
  });
});
