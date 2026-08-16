import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import type { ContentRef } from '~/types/resourcePlan';
import type { ContentItem } from '~/types/plannerData';
import type { GrowthPlan } from '~/types/growthPlan';
import type { Student } from '~/types/data';
import { StudentIcon } from '~/components/dashboard/studentIcon';
import type { Character } from '~/components/dashboard/common';
import { useAppPreferencesStore } from '~/store/useAppPreferencesStore';

interface Props {
  contentItems: ContentItem[];
  growthPlans: GrowthPlan[];
  allStudents: Record<string | number, Student>;
}

interface GroupEntry {
  studentId: number;
  goalTargetStar: number;
  goalTargetUw: number;
  currentStar: number;
  currentUw: number;
}

interface Group {
  key: string;
  date: string;
  label: string;
  timing?: 'start' | 'end';
  entries: GroupEntry[];
}

export default function ContentGroupedStudentView({ contentItems, growthPlans, allStudents }: Props) {
  const { t } = useTranslation('resources');
  const { targetGoals } = useResourcePlanStore();
  const greyOut = useAppPreferencesStore((s) => s.greyOutUnplannedStudents);
  const setGreyOut = useAppPreferencesStore((s) => s.setGreyOutUnplannedStudents);

  const contentMap = useMemo((): Record<string, ContentItem> => {
    const map: Record<string, ContentItem> = {};
    for (const ci of contentItems) map[ci.id] = ci;
    return map;
  }, [contentItems]);

  const planByStudentId = useMemo((): Record<number, GrowthPlan> => {
    const map: Record<number, GrowthPlan> = {};
    for (const p of growthPlans) {
      if (p.studentId != null) map[p.studentId] = p;
    }
    return map;
  }, [growthPlans]);

  const plannedIds = useMemo(() => new Set(growthPlans.map((plan) => plan.studentId).filter((id): id is number => id != null)), [growthPlans]);

  const portraitMap = useMemo((): Record<number, string> => {
    const map: Record<number, string> = {};
    for (const [id, s] of Object.entries(allStudents)) {
      if (s.Portrait) map[Number(id)] = s.Portrait;
    }
    return map;
  }, [allStudents]);

  const groups = useMemo((): Group[] => {
    const groupMap: Record<string, Group> = {};

    const addEntry = (studentId: number, targetStar: number, targetUw: number, contentRef: ContentRef | undefined, date: string | undefined) => {
      const plan = planByStudentId[studentId];
      const currentStar = plan?.current.star ?? 1;
      const currentUw = plan?.current.uw ?? 0;
      let key: string;
      let groupDate: string;
      let label: string;

      if (contentRef) {
        const ci = contentMap[contentRef.id];
        if (!ci) return;
        const timing = contentRef.timing ?? 'start';
        const resolvedDate = timing === 'end' ? (ci.endDate ?? ci.date) : ci.date;
        key = `${contentRef.id}_${timing}`;
        groupDate = resolvedDate;
        label = `${ci.prefix}${ci.season} ${ci.bossTitle}`;
      } else if (date) {
        key = `date_${date}`;
        groupDate = date;
        label = date;
      } else {
        return;
      }

      if (!groupMap[key]) {
        const timing = contentRef ? (contentRef.timing ?? 'start') : undefined;
        groupMap[key] = { key, date: groupDate, label, timing, entries: [] };
      }
      groupMap[key].entries.push({ studentId, goalTargetStar: targetStar, goalTargetUw: targetUw, currentStar, currentUw });
    };

    for (const [idStr, goals] of Object.entries(targetGoals)) {
      const studentId = Number(idStr);
      for (const goal of goals) {
        addEntry(studentId, goal.targetStar, goal.targetUw, goal.contentRef, goal.date);
      }
    }

    return Object.values(groupMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [targetGoals, contentMap, planByStudentId]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3 dark:border-neutral-800">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">{t('trackedItems.displayByGrowthPlan')}</div>
        <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={greyOut}
            onChange={(event) => setGreyOut(event.currentTarget.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800"
          />
          {t('trackedItems.greyOutUnplannedStudents')}
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="py-16 text-center text-sm text-neutral-400 dark:text-neutral-500">{t('trackedItems.noGoalsSet')}</div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {groups.map((group) => (
            <div key={group.key} className="py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-sm text-neutral-800 dark:text-neutral-100">{group.label}</span>
                {group.timing != null && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${group.timing === 'end' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'}`}
                  >
                    {group.timing === 'end' ? t('elephCard.timingEnd') : t('elephCard.timingStart')}
                  </span>
                )}
                {group.label !== group.date && <span className="text-xs text-neutral-400 dark:text-neutral-500">{group.date}</span>}
                <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-500">
                  {group.entries.length} {t('trackedItems.studentCount', { count: group.entries.length })}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {group.entries.map((entry) => {
                  const student = allStudents[entry.studentId];
                  const character: Character = {
                    id: entry.studentId,
                    level: 1,
                    star: entry.goalTargetStar,
                    hasWeapon: entry.goalTargetUw > 0,
                    weaponStar: entry.goalTargetUw,
                    isAssist: false,
                  };
                  return (
                    <div key={`${group.key}_${entry.studentId}`} className="flex flex-col items-center gap-1 w-14">
                      <StudentIcon character={character} student={student} portraitData={portraitMap} grayscale={greyOut && !plannedIds.has(character.id)} />
                      {student && (
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 text-center leading-tight truncate w-full" title={student.Name}>
                          {student.Name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
