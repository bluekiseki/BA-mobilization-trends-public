import { describe, it, expect } from 'vitest';
import type { GrowthPlan } from '~/types/growthPlan';
import { normalizePlan, isUnrecruited } from './recruitState';

const statBlock = (): GrowthPlan['target'] => ({
  level: 1,
  star: 3,
  uw: 0,
  uwLevel: 1,
  ex: 1,
  normal: 1,
  passive: 1,
  sub: 1,
  affection: 1,
  equipment: [0, 0, 0],
  gear: 0,
  potential: { hp: 0, atk: 0, heal: 0 },
});

const makePlan = (patch: Partial<GrowthPlan> = {}): GrowthPlan => ({
  uuid: 'p1',
  studentId: 10000,
  current: { ...statBlock(), eleph: 0, affectionExp: 0 },
  target: statBlock(),
  includedInEvents: [],
  useEligmaForStar: false,
  eligmaInfo: { price: 1, stock: 20 },
  isSelected: true,
  ...patch,
});

describe('normalizePlan', () => {
  it('returns recruited plans untouched', () => {
    const plan = makePlan();
    plan.current.level = 50;
    expect(normalizePlan(plan)).toBe(plan);
    expect(isUnrecruited(plan)).toBe(false);
  });

  it('resets everything but star and eleph of an unrecruited plan to the recruit baseline', () => {
    const plan = makePlan({ recruited: false });
    plan.current = {
      ...plan.current,
      level: 80,
      uw: 2,
      uwLevel: 30,
      ex: 5,
      normal: 10,
      affection: 40,
      affectionExp: 12,
      gear: 1,
      star: 4,
      eleph: 25,
      equipment: [7, 7, 7],
      potential: { hp: 5, atk: 5, heal: 5 },
    };
    plan.target.level = 90;

    const result = normalizePlan(plan);

    expect(result.current).toMatchObject({ level: 1, uw: 0, uwLevel: 1, ex: 1, normal: 1, passive: 1, sub: 1, affection: 1, affectionExp: 0, gear: 0, star: 4, eleph: 25 });
    expect(result.current.equipment).toEqual([0, 0, 0]);
    expect(result.current.potential).toEqual({ hp: 0, atk: 0, heal: 0 });
    expect(result.target.level).toBe(90);
  });

  it('keeps the target at or above the acquired star', () => {
    const plan = makePlan({ recruited: false });
    plan.current.star = 4;
    plan.target.star = 3;
    expect(normalizePlan(plan).target.star).toBe(4);
  });

  it('clamps an out-of-range acquired star', () => {
    const plan = makePlan({ recruited: false });
    plan.current.star = 0;
    expect(normalizePlan(plan).current.star).toBe(1);
    plan.current.star = 9;
    expect(normalizePlan(plan).current.star).toBe(5);
  });

  it('is idempotent', () => {
    const plan = makePlan({ recruited: false });
    plan.current.level = 33;
    const once = normalizePlan(plan);
    expect(normalizePlan(once)).toEqual(once);
  });
});
