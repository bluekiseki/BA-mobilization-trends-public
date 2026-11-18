import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialNeedsSection } from '~/components/student/MaterialNeedsSection';
import { useExpectedIncome } from '~/hooks/useExpectedIncome';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import type { GrowthPlan } from '~/types/growthPlan';
import type { EventData } from '~/types/plannerData';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import { getItemTitle } from '~/utils/scheduleDisplay';
import { buildUwDemandFromPlans, calcUwMaterialXp } from '~/utils/uwMaterialXp';
import type { Locale } from '~/utils/i18n/config';
import type { PlannerAssets } from '../logic/usePlannerAssets';

// Raid, multifloor and event schedule of a server; the raids and events also feed the income estimate
export interface GrowthSchedule {
  raid: ScheduleItemV2[];
  multifloor: ScheduleItemV2[];
  event: ScheduleItemV2[];
}

export const NO_SCHEDULE: GrowthSchedule = { raid: [], multifloor: [], event: [] };

// Everything the given plans still need, compared against the shared inventory and the expected income like the planner does
export function StudentPlanNeeds({ plans, assets, schedule, today, title }: { plans: GrowthPlan[]; assets: PlannerAssets; schedule: GrowthSchedule; today: string; title: string }) {
  const { i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const server = useResourcePlanStore((state) => state.server);
  const materialInventory = useGlobalStore((state) => state.materialInventory);
  const getTitle = useCallback((item: ScheduleItemV2) => getItemTitle(item, locale, i18n), [locale, i18n]);
  const incomeByKey = useExpectedIncome({ server, events: schedule.event, raidItems: schedule.raid, multifloorItems: schedule.multifloor, today, getTitle });
  const needs = useMemo(() => calculatedGrowthNeeds(plans, assets.allStudents), [plans, assets.allStudents]);
  const uwSummary = useMemo(() => calcUwMaterialXp(materialInventory, buildUwDemandFromPlans(plans, assets.allStudents)), [plans, assets.allStudents, materialInventory]);
  if (Object.keys(needs).length === 0) return null;
  return <MaterialNeedsSection calculatedNeeds={needs} eventData={{ icons: assets.iconInfo } as EventData} iconData={assets.iconData} title={title} uwSummary={uwSummary} incomeByKey={incomeByKey} />;
}
