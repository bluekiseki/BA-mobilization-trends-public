import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ContentGroupedStudentView from '~/components/student/ContentGroupedStudentView';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import type { Student } from '~/types/data';
import type { Locale } from '~/utils/i18n/config';
import { SpreadsheetCsvTools } from '../spreadsheet/SpreadsheetCsvTools';
import { StudentSpreadsheetView } from '../spreadsheet/StudentSpreadsheetView';
import { buildContentItems } from '../logic/contentItems';
import { usePlannerAssets } from '../logic/usePlannerAssets';
import { NO_SCHEDULE, type GrowthSchedule } from './StudentPlanNeeds';

export type PlanView = 'table' | 'content';

// The spreadsheet and the by-content list of the growth plans, narrowed to the students the directory filters let through
export function StudentPlanViews({
  view,
  shownIds,
  order,
  schedules,
  today,
  locale,
}: {
  view: PlanView;
  shownIds: ReadonlySet<number>;
  // The same students in the directory's sort order
  order?: readonly number[];
  schedules: { kr: GrowthSchedule; jp: GrowthSchedule } | null;
  today: string;
  locale: Locale;
}) {
  const { t, i18n } = useTranslation('students');
  const growthPlans = useGlobalStore((state) => state.growthPlans);
  const setGrowthPlans = useGlobalStore((state) => state.setGrowthPlans);
  const server = useResourcePlanStore((state) => state.server);
  const { assets, failed } = usePlannerAssets(locale);
  const schedule = schedules?.[server] ?? NO_SCHEDULE;
  const contentItems = useMemo(() => buildContentItems([...schedule.raid, ...schedule.multifloor], today, locale, i18n), [schedule, today, locale, i18n]);
  // The array is rebuilt on every render, so the map is keyed by its content to keep the spreadsheet from re-sorting needlessly
  const orderKey = order?.join(',');
  const baseOrder = useMemo(() => (orderKey === undefined ? undefined : new Map(orderKey.split(',').map((id, index) => [Number(id), index]))), [orderKey]);
  const matchesStudent = (student: Student | undefined) => student !== undefined && shownIds.has(student.Id);
  if (failed) return <p className="text-sm text-red-600 dark:text-red-400">{t('growthLoadFailed')}</p>;
  if (!assets) return <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('growthLoading')}</p>;
  if (view === 'content') return <ContentGroupedStudentView contentItems={contentItems} growthPlans={growthPlans} allStudents={assets.allStudents} matchesStudent={matchesStudent} />;
  return (
    <div className="space-y-3">
      <SpreadsheetCsvTools growthPlans={growthPlans} allStudents={assets.allStudents as Record<string, { Name: string }>} setGrowthPlans={setGrowthPlans} />
      <StudentSpreadsheetView allStudents={assets.allStudents} searchTerm="" showOnlySelected={false} matchesStudent={matchesStudent} baseOrder={baseOrder} />
    </div>
  );
}
