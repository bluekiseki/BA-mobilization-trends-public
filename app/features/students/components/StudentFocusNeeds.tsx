import { useTranslation } from 'react-i18next';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import type { PlannerAssets } from '../logic/usePlannerAssets';
import { NO_SCHEDULE, StudentPlanNeeds, type GrowthSchedule } from './StudentPlanNeeds';

// The materials all focus students still need together, as in the growth planner.
// `assets` is fetched by the caller so the catalog is loaded once, shared with the needs-count badge.
export function StudentFocusNeeds({
  schedules,
  today,
  assets,
  failed,
}: {
  schedules: { kr: GrowthSchedule; jp: GrowthSchedule } | null;
  today: string;
  assets: PlannerAssets | null;
  failed: boolean;
}) {
  const { t } = useTranslation('students');
  const { t: planner } = useTranslation('planner');
  const growthPlans = useGlobalStore((state) => state.growthPlans);
  const server = useResourcePlanStore((state) => state.server);
  const focus = growthPlans.filter((plan) => plan.isSelected);
  if (failed) return <p className="text-sm text-red-600 dark:text-red-400">{t('growthLoadFailed')}</p>;
  if (!assets) return <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('growthLoading')}</p>;
  if (focus.length === 0) return <p className="text-sm text-neutral-500 dark:text-neutral-400">{planner('ui.noStudentSelected')}</p>;
  return <StudentPlanNeeds plans={focus} assets={assets} schedule={schedules?.[server] ?? NO_SCHEDULE} today={today} title={`${planner('ui.totalNeededTitle')} (${focus.length})`} />;
}
