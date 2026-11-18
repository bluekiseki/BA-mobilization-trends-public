import type { GrowthPlan } from '~/types/growthPlan';

export const isUnrecruited = (plan: Pick<GrowthPlan, 'recruited'>): boolean => plan.recruited === false;

export const MIN_RECRUIT_STAR = 1;
export const MAX_RECRUIT_STAR = 5;

/** Stat block of a student right after recruitment, except `star` (depends on the student/pickup) and `eleph`. */
export const RECRUIT_BASELINE = {
  level: 1,
  uw: 0,
  uwLevel: 1,
  ex: 1,
  normal: 1,
  passive: 1,
  sub: 1,
  affection: 1,
  affectionExp: 0,
  gear: 0,
} as const;

const clampStar = (star: number) => Math.min(MAX_RECRUIT_STAR, Math.max(MIN_RECRUIT_STAR, Math.round(star) || MIN_RECRUIT_STAR));

/**
 * Single enforcement point of the invariant: an unrecruited plan keeps the recruit baseline in `current`
 * (only `star` and `eleph` stay user-editable) and its target never falls below `current`.
 * Recruited plans are returned untouched.
 */
export function normalizePlan(plan: GrowthPlan): GrowthPlan {
  if (!isUnrecruited(plan)) return plan;

  const current: GrowthPlan['current'] = {
    ...plan.current,
    ...RECRUIT_BASELINE,
    star: clampStar(plan.current.star),
    equipment: [0, 0, 0],
    potential: { hp: 0, atk: 0, heal: 0 },
  };

  const target: GrowthPlan['target'] = {
    ...plan.target,
    level: Math.max(plan.target.level, current.level),
    uwLevel: Math.max(plan.target.uwLevel, current.uwLevel),
    ex: Math.max(plan.target.ex, current.ex),
    normal: Math.max(plan.target.normal, current.normal),
    passive: Math.max(plan.target.passive, current.passive),
    sub: Math.max(plan.target.sub, current.sub),
    affection: Math.max(plan.target.affection, current.affection),
    gear: Math.max(plan.target.gear, current.gear),
    equipment: [plan.target.equipment[0], plan.target.equipment[1], plan.target.equipment[2]],
    potential: { ...plan.target.potential },
  };
  // The target rank (star + unique weapon) must not be below the acquired star
  const targetRank = target.uw > 0 ? 5 + target.uw : target.star;
  if (current.star > targetRank) {
    target.star = current.star;
    target.uw = 0;
    target.uwLevel = 1;
  }

  return { ...plan, current, target };
}

export const normalizePlans = (plans: GrowthPlan[]): GrowthPlan[] => plans.map(normalizePlan);
