// // SkillsTab.tsx

import { useTranslation } from 'react-i18next';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EXSkill, Student } from '~/types/plannerData';
import { SkillDisplay } from './SkillDisplay';
import { MinMaxControls } from './MinMaxControls';

export const SKILL_CONFIG = [
  { id: 'ex', labelKey: 'common.ex', skillKey: 'Ex', maxLevel: 5 },
  { id: 'normal', labelKey: 'common.normal', skillKey: 'Public', maxLevel: 10 },
  {
    id: 'passive',
    labelKey: 'common.passive',
    skillKey: 'Passive',
    maxLevel: 10,
  },
  { id: 'sub', labelKey: 'common.sub', skillKey: 'ExtraPassive', maxLevel: 10 },
] as const;

interface SkillsTabProps {
  plan: GrowthPlan;
  studentInfo: Student | null;
  handlePlanChange: (field: string, value: any, isNumeric?: boolean) => void;
}

export const SkillsTab = ({ plan, studentInfo, handlePlanChange }: SkillsTabProps) => {
  const { t } = useTranslation('planner');

  if (!studentInfo) return <div className="text-center p-4 text-xs text-gray-400">Please select a student.</div>;

  return (
    <div className="flex flex-col divide-y divide-gray-200 dark:divide-neutral-700">
      {SKILL_CONFIG.map(({ id, labelKey, skillKey, maxLevel }) => {
        // @ts-ignore
        const mainSkillData = studentInfo.Skills[skillKey];

        const skillRenderList = skillKey === 'Ex' && (mainSkillData as EXSkill)?.ExtraSkills ? (mainSkillData as EXSkill).ExtraSkills : [mainSkillData];

        return (
          <div key={id} className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-start gap-4">
            {}
            <div className="flex-1 min-w-0 overflow-hidden">
              {skillRenderList &&
                skillRenderList.map((s: any, idx: number) => (
                  <div key={idx} className={idx > 0 ? 'mt-2 pt-2 border-t border-dashed border-gray-100 dark:border-neutral-800' : ''}>
                    <SkillDisplay
                      studentInfo={studentInfo}
                      skillKey={skillKey}
                      skillLabel={t(labelKey)}
                      currentLevel={plan.current[id]}
                      targetLevel={plan.target[id]}
                      currentUW={plan.current.uw}
                      targetUW={plan.target.uw}
                      skillData={s}
                      currentRank={plan.current.affection}
                      targetRank={plan.target.affection}
                    />
                  </div>
                ))}
            </div>

            {}
            <div className="w-full md:w-[280px] shrink-0 md:self-center">
              <div className="grid grid-cols-2 gap-3">
                {/* Current */}
                <div>
                  <MinMaxControls label="Current" onMin={() => handlePlanChange(`current.${id}`, 1, true)} onMax={() => handlePlanChange(`current.${id}`, maxLevel, true)} />
                  <select
                    value={plan.current[id]}
                    onChange={(e) => handlePlanChange(`current.${id}`, e.target.value, true)}
                    className="w-full p-1.5 text-sm border border-gray-200 rounded bg-white dark:bg-neutral-700 dark:border-neutral-600 text-center"
                  >
                    {Array.from({ length: maxLevel }, (_, i) => i + 1).map((level) => (
                      <option key={level} value={level}>
                        Lv.{level}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target */}
                <div>
                  <MinMaxControls label="Goal" onMin={() => handlePlanChange(`target.${id}`, plan.current[id], true)} onMax={() => handlePlanChange(`target.${id}`, maxLevel, true)} />
                  <select
                    value={plan.target[id]}
                    onChange={(e) => handlePlanChange(`target.${id}`, e.target.value, true)}
                    className="w-full p-1.5 text-sm border border-blue-200 rounded bg-white text-blue-600 font-bold dark:bg-neutral-700 dark:border-blue-900/50 dark:text-blue-400 text-center"
                  >
                    {Array.from({ length: maxLevel }, (_, i) => i + 1).map((level) => (
                      <option key={level} value={level} disabled={level < plan.current[id]}>
                        Lv.{level} {level === maxLevel ? 'MAX' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
