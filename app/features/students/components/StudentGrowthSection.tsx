import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrash2 } from 'react-icons/fi';
import { ConfirmDialog } from '~/components/common/ConfirmDialog';
import { StudentGrowthPlanCard } from '~/components/student/StudentGrowthPlanCard';
import { ClientOnly } from '~/components/common/ClientOnly';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import { getCombatStylePlanGroupId, getCombatStyleRepresentativeId } from '~/utils/combatStyle';
import type { Locale } from '~/utils/i18n/config';
import type { ContentItem, EventData } from '~/types/plannerData';
import { usePlannerAssets } from '../logic/usePlannerAssets';
import { NO_SCHEDULE, StudentPlanNeeds, type GrowthSchedule } from './StudentPlanNeeds';

export interface GrowthContentItems {
  kr: ContentItem[];
  jp: ContentItem[];
}

interface Props {
  studentId: number;
  starGrade: number;
  contentItems: GrowthContentItems;
  schedules: { kr: GrowthSchedule; jp: GrowthSchedule } | null;
  today: string;
}

function GrowthSectionBody({ studentId, starGrade, contentItems, schedules, today }: Props) {
  const { t, i18n } = useTranslation('students');
  const { t: planner } = useTranslation('planner');
  const locale = i18n.language as Locale;
  const growthPlans = useGlobalStore((state) => state.growthPlans);
  const addPlanForStudent = useGlobalStore((state) => state.addPlanForStudent);
  const removePlan = useGlobalStore((state) => state.removePlan);
  const server = useResourcePlanStore((state) => state.server);
  const { assets, failed } = usePlannerAssets(locale);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Looking a plan up never creates one; it is only created by the explicit button below.
  const groupId = getCombatStylePlanGroupId(studentId);
  const plan = useMemo(() => growthPlans.find((p) => p.studentId !== null && getCombatStylePlanGroupId(p.studentId) === groupId), [growthPlans, groupId]);

  if (failed) return <p className="py-6 text-sm text-red-600 dark:text-red-400">{t('growthLoadFailed')}</p>;
  if (!assets) return <p className="py-6 text-sm text-neutral-500 dark:text-neutral-400">{t('growthLoading')}</p>;

  return (
    <div className="space-y-4 py-4">
      {plan && (
        <div className="flex justify-end">
          <button type="button" className="flex items-center gap-1.5 text-sm text-red-600 hover:underline dark:text-red-400" onClick={() => setConfirmOpen(true)}>
            <FiTrash2 aria-hidden size={14} />
            {t('growthDelete')}
          </button>
        </div>
      )}
      {plan ? (
        <div className="space-y-3">
          <StudentGrowthPlanCard
            embedded
            plan={plan}
            allStudents={assets.allStudents}
            studentOptions={[]}
            iconData={assets.iconData}
            eventData={{ icons: assets.iconInfo } as EventData}
            contentItems={contentItems[server]}
            onClose={() => undefined}
          />
          <StudentPlanNeeds plans={[plan]} assets={assets} schedule={schedules?.[server] ?? NO_SCHEDULE} today={today} title={planner('ui.totalNeededTitle')} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <p className="text-sm">{t('growthNoPlan')}</p>
          <button
            type="button"
            className="rounded bg-ba-btn-blue px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark"
            onClick={() => addPlanForStudent(getCombatStyleRepresentativeId(studentId), starGrade, starGrade)}
          >
            {t('growthCreate')}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen && plan !== undefined}
        message={t('growthDeleteConfirm')}
        confirmLabel={t('growthDelete')}
        danger
        onConfirm={() => {
          setConfirmOpen(false);
          if (plan) removePlan(plan.uuid);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// Plans live in localStorage, so render on the client only to avoid a hydration mismatch.
export function StudentGrowthSection(props: Props) {
  return (
    <ClientOnly>
      <GrowthSectionBody {...props} />
    </ClientOnly>
  );
}
