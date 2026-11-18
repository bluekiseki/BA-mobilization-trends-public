import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import type { GrowthPlan } from '~/types/growthPlan';
import { getCombatStylePlanGroupId } from '~/utils/combatStyle';

// The reader's growth plans by student. Plans live in localStorage, so nothing is found until the page is on the client; that keeps
// the server render and the first client render the same.
export function usePlanLookup(): { planOf: (studentId: number) => GrowthPlan | undefined; plans: GrowthPlan[] } {
  const growthPlans = useGlobalStore((state) => state.growthPlans);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const plans = useMemo(() => (mounted ? growthPlans : []), [mounted, growthPlans]);
  const byGroup = useMemo(() => new Map(plans.flatMap((plan) => (plan.studentId === null ? [] : [[getCombatStylePlanGroupId(plan.studentId), plan] as const]))), [plans]);
  const planOf = useCallback((studentId: number) => byGroup.get(getCombatStylePlanGroupId(studentId)), [byGroup]);
  return { planOf, plans };
}
