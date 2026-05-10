import { useState, useMemo, useEffect } from 'react';
import { MaterialNeedsSection } from './MaterialNeedsSection';
import { StudentGrowthPlanCard } from './StudentGrowthPlanCard';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
import type { EventData, IconData, Student, StudentData, StudentPortraitData } from '~/types/plannerData';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useTranslation } from 'react-i18next';
import { ChevronIcon } from '../../Icon';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';

interface StudentGrowthPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  allStudents: StudentData;
  studentPortraits: StudentPortraitData;
  onCalculate: (needs: Record<string, number>) => void;
}

export const StudentGrowthPlanner = ({ eventId, eventData, iconData, allStudents, studentPortraits, onCalculate }: StudentGrowthPlannerProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { growthPlans, addPlan } = useGlobalStore();

  const { t, i18n } = useTranslation('planner');
  const locale = i18n.language as Locale;

  const plansForThisEvent = useMemo(() => growthPlans.filter((p) => p.includedInEvents.includes(eventId)), [growthPlans, eventId]);

  const calculatedNeeds = useMemo(() => {
    return calculatedGrowthNeeds(plansForThisEvent, allStudents);
  }, [plansForThisEvent, allStudents]);

  useEffect(() => {
    Object.entries(allStudents).map(([studentId, student]) => {
      student.Portrait = studentPortraits[parseInt(studentId)];
    });
  }, [allStudents, studentPortraits]);

  useEffect(() => {
    onCalculate(calculatedNeeds);
  }, [calculatedNeeds, onCalculate]);

  const studentOptions = useMemo(() => {
    if (!eventData.bonus || Object.keys(allStudents).length === 0) {
      return Object.entries(allStudents).sort(([, a], [, b]) => a.Name.localeCompare(b.Name));
    }
    const bonusStudentIds = Object.keys(eventData.bonus);
    const studentOptionsTop = bonusStudentIds
      .sort((a, b) => -eventData.bonus[a].BonusPercentage.reduce((acc, val) => acc + val, 0) + eventData.bonus[b].BonusPercentage.reduce((acc, val) => acc + val, 0))
      .map((v) => [v, allStudents[Number(v)]] as [string, Student])
      .filter(([, student]) => student);

    const bonusIdSet = new Set(bonusStudentIds);
    const studentOptionsAll = Object.entries(allStudents)
      .filter(([id]) => !bonusIdSet.has(id))
      .sort(([, a], [, b]) => a.Name.localeCompare(b.Name));

    return [...studentOptionsTop, ...studentOptionsAll];
  }, [allStudents, eventData.bonus]);

  return (
    <>
      <div className="flex justify-between items-center cursor-pointer group" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('page.studentGrowthPlanner')}</h2>
        <span className="text-2xl transition-transform duration-300 group-hover:scale-110">
          <ChevronIcon className={isCollapsed ? 'rotate-180' : ''} />
        </span>
      </div>
      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          <div className="text-right">
            <a href={String(localeLink(locale, '/planner/students'))} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline dark:text-blue-400">
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
                  studentPortraits={studentPortraits}
                  studentOptions={studentOptions}
                  eventData={eventData}
                  iconData={iconData}
                  onClose={function (): void {
                    throw new Error('Function not implemented.');
                  }}
                />
              ))
            ) : (
              <div className="text-center text-gray-400 dark:text-gray-500 p-4">{t('ui.noStudentPlanInEvent')}</div>
            )}
          </div>
          <button onClick={() => addPlan(eventId)} className="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-bold py-2 rounded-lg mt-2">
            {t('ui.addNewPlan')}
          </button>
          {Object.keys(calculatedNeeds).length > 0 && <MaterialNeedsSection calculatedNeeds={calculatedNeeds} eventData={eventData} iconData={iconData} />}
        </div>
      )}
    </>
  );
};
