import { type Locale } from '~/utils/i18n/config';
import { getItemName } from '~/utils/locale';
import type { IconInfos, Student } from '~/types/plannerData';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { StudentTargetGoal } from '~/types/resourcePlan';
import type { PurchasePanelEntry } from '~/features/inventory/types';
import { calcElephNeeded } from '~/utils/elephEligmaCalc';
import { EXPERT_PERMIT_SHOP_EXCLUDED_IDS, EXPERT_PERMIT_ELEPH_COST, EXPERT_PERMIT_ELIGMA, type ExpertPermitStudentType } from '~/data/elephSources';

export const EQUIP_CATEGORIES = ['Hat', 'Gloves', 'Shoes', 'Bag', 'Badge', 'Hairpin', 'Charm', 'Watch', 'Necklace'] as const;
export type ProjectionSchedule = ReturnType<(typeof import('~/features/inventory/logic/resourceProjectionLoader'))['loadResourceProjectionSchedule']>;
export let cachedProjectionSchedule: ProjectionSchedule | null = null;
let projectionSchedulePromise: Promise<ProjectionSchedule> | null = null;
export function getProjectionSchedule(): Promise<ProjectionSchedule> {
  if (cachedProjectionSchedule) return Promise.resolve(cachedProjectionSchedule);
  projectionSchedulePromise ??= import('~/features/inventory/logic/resourceProjectionLoader')
    .then(({ loadResourceProjectionSchedule }) => {
      cachedProjectionSchedule = loadResourceProjectionSchedule();
      return cachedProjectionSchedule;
    })
    .catch((error: unknown) => {
      projectionSchedulePromise = null;
      throw error;
    });
  return projectionSchedulePromise;
}
function toStarValue(star: number, uw: number): number {
  return uw > 0 ? 5 + uw : star;
}
export function isElephGoalReached(plan: GrowthPlan, studentId: number, targetGoals: Record<number, StudentTargetGoal[]>, materialInventory: Record<string, number>): boolean {
  const finalGoal = targetGoals[studentId]?.find((g) => g.id === 'final');
  const configuredGoals = targetGoals[studentId] ?? [];
  const target = configuredGoals.reduce((best, goal) => (toStarValue(goal.targetStar, goal.targetUw) > toStarValue(best.star, best.uw) ? { star: goal.targetStar, uw: goal.targetUw } : best), {
    star: finalGoal?.targetStar ?? plan.target.star,
    uw: finalGoal?.targetUw ?? plan.target.uw,
  });
  const requiredEleph = calcElephNeeded(plan.current.star, target.star, plan.current.uw, target.uw);
  const currentEleph = materialInventory[`Item_${studentId}`] ?? plan.current.eleph ?? 0;
  return requiredEleph <= currentEleph;
}
export function expertPermitShopAvailableYearMonth(firstPickup: string, type: ExpertPermitStudentType): string {
  const d = new Date(firstPickup + 'T00:00:00Z');
  if (type === 'pass_limited') {
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
  } else {
    d.setUTCFullYear(d.getUTCFullYear() + 1, d.getUTCMonth(), 1);
  }
  return d.toISOString().slice(0, 7);
}
export function buildExpertPermitEntries(
  studentsRecord: Record<number, Student>,
  growthPlans: GrowthPlan[],
  itemIconInfo: IconInfos | null,
  locale: Locale,
  targetGoals: Record<number, StudentTargetGoal[]>,
  materialInventory: Record<string, number>,
): PurchasePanelEntry[] {
  const entries: PurchasePanelEntry[] = [];
  entries.push({
    gainItemKey: 'Item_23',
    label: getItemName('Item_23', itemIconInfo, locale),
    shopItem: {
      gainItemKey: 'Item_23',
      gainAmount: 5,
      costPerBundle: EXPERT_PERMIT_ELIGMA.expertPermitPer5,
      monthlyLimit: EXPERT_PERMIT_ELIGMA.monthlyMax,
    },
    coinKey: 'Currency_18',
    sourceType: 'expert_permit_exchange',
    isAtMax: false,
  });
  for (const [idStr, meta] of Object.entries(studentsRecord)) {
    const studentId = Number(idStr);
    if (EXPERT_PERMIT_SHOP_EXCLUDED_IDS.has(studentId)) continue;
    const il = meta?.IsLimited?.[1];
    if (il !== 1 && il !== 2 && il !== 3) continue;
    const expertPermitType: ExpertPermitStudentType = il === 3 ? 'pass_limited' : il === 1 ? 'limited' : 'distributed';
    const permitInfo = EXPERT_PERMIT_ELEPH_COST[expertPermitType];
    if (!permitInfo) continue;
    const plan = growthPlans.find((p) => p.studentId === studentId);
    const isAtMax = plan != null && isElephGoalReached(plan, studentId, targetGoals, materialInventory);
    const gainItemKey = `Item_${studentId}`;
    entries.push({
      gainItemKey,
      label: getItemName(gainItemKey, itemIconInfo, locale),
      shopItem: {
        gainItemKey,
        gainAmount: 5,
        costPerBundle: permitInfo.expertPermitPer5Eleph,
        monthlyLimit: permitInfo.monthlyMaxPurchases,
      },
      coinKey: 'Currency_18',
      sourceType: 'expert_permit_shop',
      isAtMax,
    });
  }
  return entries;
}
