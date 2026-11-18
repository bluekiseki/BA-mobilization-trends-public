import { describe, expect, it } from 'vitest';
import type { GrowthPlan } from '~/types/growthPlan';
import { matchesPlanFilter, parsePlanFilter } from './planFilter';

const block = { level: 1, star: 1, uw: 0, uwLevel: 1, ex: 1, normal: 1, passive: 1, sub: 1, affection: 1, gear: 0, equipment: [0, 0, 0], potential: { hp: 0, atk: 0, heal: 0 } };
const plan = (over: Partial<GrowthPlan> = {}, targetLevel = 1) =>
  ({ uuid: 'a', studentId: 1, current: { ...block, eleph: 0, affectionExp: 0 }, target: { ...block, level: targetLevel }, isSelected: false, ...over }) as unknown as GrowthPlan;

describe('plan filter', () => {
  it('needs a plan for every filter but all', () => {
    expect(matchesPlanFilter(undefined, 'all')).toBe(true);
    for (const filter of ['recruited', 'plan', 'goal', 'focus'] as const) expect(matchesPlanFilter(undefined, filter)).toBe(false);
  });
  it('treats a student without a plan as unrecruited', () => {
    expect(matchesPlanFilter(undefined, 'unrecruited')).toBe(true);
    expect(matchesPlanFilter(plan(), 'unrecruited')).toBe(false);
    expect(matchesPlanFilter(plan(), 'recruited')).toBe(true);
    expect(matchesPlanFilter(plan({ recruited: false }), 'recruited')).toBe(false);
  });
  it('tells goals, unrecruited and focus plans apart', () => {
    expect(matchesPlanFilter(plan(), 'plan')).toBe(true);
    expect(matchesPlanFilter(plan(), 'goal')).toBe(false);
    expect(matchesPlanFilter(plan({}, 90), 'goal')).toBe(true);
    expect(matchesPlanFilter(plan({ recruited: false }), 'unrecruited')).toBe(true);
    expect(matchesPlanFilter(plan({ isSelected: true }), 'focus')).toBe(true);
  });
  it('falls back to all for an unknown value', () => expect(parsePlanFilter('nope')).toBe('all'));
});
