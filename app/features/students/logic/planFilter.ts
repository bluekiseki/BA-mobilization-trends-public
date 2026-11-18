import type { GrowthPlan } from '~/types/growthPlan';
import { isUnrecruited } from '~/utils/student/recruitState';
import { hasGrowthGoal } from './studentFilterFields';

export const PLAN_FILTERS = ['all', 'recruited', 'unrecruited', 'plan', 'goal', 'focus'] as const;
export type PlanFilter = (typeof PLAN_FILTERS)[number];

export function parsePlanFilter(value: string | null): PlanFilter {
  return PLAN_FILTERS.find((filter) => filter === value) ?? 'all';
}

/** Whether a student, given their growth plan (if any), passes the plan filter. */
export function matchesPlanFilter(plan: GrowthPlan | undefined, filter: PlanFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'plan':
      return plan !== undefined;
    case 'goal':
      return plan !== undefined && hasGrowthGoal(plan);
    // A student with no plan at all has not been recruited either
    case 'recruited':
      return plan !== undefined && !isUnrecruited(plan);
    case 'unrecruited':
      return plan === undefined || isUnrecruited(plan);
    case 'focus':
      return plan?.isSelected === true;
  }
}
