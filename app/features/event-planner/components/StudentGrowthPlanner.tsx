import { useMemo, useEffect } from 'react';
import { MaterialNeedsSection } from '../../../components/student/MaterialNeedsSection';
import { StudentGrowthPlanCard } from '../../../components/student/StudentGrowthPlanCard';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
import { buildUwDemandFromPlans, calcUwMaterialXp } from '~/utils/uwMaterialXp';
import type { EventData, IconData, Student, StudentData } from '~/types/plannerData';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useTranslation } from 'react-i18next';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';
import { isCombatStyleFormOne } from '~/utils/combatStyle';

interface StudentGrowthPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  allStudents: StudentData;
  onCalculate: (needs: Record<string, number>) => void;
}

export const StudentGrowthPlanner = ({ eventId, eventData, iconData, allStudents, onCalculate }: StudentGrowthPlannerProps) => {
  // const [isCollapsed, setIsCollapsed] = useState(false);
  const { growthPlans, addPlan, materialInventory } = useGlobalStore();

  const { t, i18n } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;

  const plansForThisEvent = useMemo(() => growthPlans.filter((p) => p.includedInEvents.includes(eventId)), [growthPlans, eventId]);

  const calculatedNeeds = useMemo(() => {
    return calculatedGrowthNeeds(plansForThisEvent, allStudents);
  }, [plansForThisEvent, allStudents]);

  // Weapon-type-bonus-aware unique weapon material coverage for this event's plans, so the
  // uwGrowth badge below agrees with the inventory page's goal-comparison summary.
  const uwSummary = useMemo(() => {
    const demand = buildUwDemandFromPlans(plansForThisEvent, allStudents);
    return calcUwMaterialXp(materialInventory, demand);
  }, [plansForThisEvent, allStudents, materialInventory]);

  useEffect(() => {
    onCalculate(calculatedNeeds);
  }, [calculatedNeeds]);

  const studentOptions = useMemo(() => {
    if (!eventData.bonus || Object.keys(allStudents).length === 0) {
      return Object.entries(allStudents)
        .filter(([id]) => !isCombatStyleFormOne(Number(id)))
        .sort(([, a], [, b]) => a.Name?.localeCompare(b.Name));
    }
    const bonusStudentIds = Object.keys(eventData.bonus);
    const studentOptionsTop = bonusStudentIds
      .sort((a, b) => {
        const aBonus = eventData.bonus?.[a]?.BonusPercentage.reduce((acc, val) => acc + val, 0) ?? 0;
        const bBonus = eventData.bonus?.[b]?.BonusPercentage.reduce((acc, val) => acc + val, 0) ?? 0;
        return bBonus - aBonus;
      })
      .map((v) => [v, allStudents[Number(v)]] as [string, Student])
      .filter(([id, student]) => student && !isCombatStyleFormOne(Number(id)));

    const bonusIdSet = new Set(bonusStudentIds);
    console.log('Object.entries(allStudents)', Object.entries(allStudents));
    const studentOptionsAll = Object.entries(allStudents)
      .filter(([id]) => !bonusIdSet.has(id) && !isCombatStyleFormOne(Number(id)))
      .sort(([, a], [, b]) => a.Name?.localeCompare(b.Name));

    return [...studentOptionsTop, ...studentOptionsAll];
  }, [allStudents, eventData.bonus]);

  return (
    <>
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t_ui('studentGrowthPlanner')}</h2>

      <div className="mt-4 space-y-4">
        <div className="text-right">
          <a href={localeLink(locale, '/students')} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline dark:text-blue-400">
            {t('ui.goToFullPage')}
          </a>
        </div>
        <div className="space-y-4">
          {plansForThisEvent.length > 0 ? (
            plansForThisEvent.map((plan) => (
              <StudentGrowthPlanCard
                key={plan.uuid}
                plan={plan}
                allStudents={allStudents}
                studentOptions={studentOptions}
                eventData={eventData}
                iconData={iconData}
                onClose={function (): void {
                  throw new Error('Function not implemented.');
                }}
              />
            ))
          ) : (
            <div className="text-center text-neutral-400 dark:text-neutral-500 p-4">{t('ui.noStudentPlanInEvent')}</div>
          )}
        </div>
        <button onClick={() => addPlan(eventId)} className="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-bold py-2 rounded-lg mt-2">
          {t('ui.addNewPlan')}
        </button>
        {Object.keys(calculatedNeeds).length > 0 && <MaterialNeedsSection calculatedNeeds={calculatedNeeds} eventData={eventData} iconData={iconData} uwSummary={uwSummary} />}
      </div>
    </>
  );
};
