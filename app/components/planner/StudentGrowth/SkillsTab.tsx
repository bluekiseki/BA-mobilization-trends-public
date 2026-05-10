// SkillsTab.tsx

import { useTranslation } from 'react-i18next';
import { FiInfo } from 'react-icons/fi';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, EXSkill, IconData, Student } from '~/types/plannerData';
import { calcSkillCostNeeds } from '~/utils/calculatedGrowthNeeds';
import { SkillDisplay } from './SkillDisplay';
import { MinMaxControls } from './MinMaxControls';
import { InlineCostHint } from './InlineCostHint';

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
  iconData?: IconData;
  eventData?: EventData;
}

export const SkillsTab = ({ plan, studentInfo, handlePlanChange, iconData, eventData }: SkillsTabProps) => {
  const { t } = useTranslation('planner');

  if (!studentInfo) return <div className="text-center p-4 text-xs text-gray-400">Please select a student.</div>;

  return (
    <div className="flex flex-col divide-y divide-gray-200 dark:divide-neutral-700">
      {SKILL_CONFIG.map(({ id, labelKey, skillKey, maxLevel }) => {
        // @ts-ignore
        const mainSkillData = studentInfo.Skills[skillKey];

        const skillRenderList = skillKey === 'Ex' && (mainSkillData as EXSkill)?.ExtraSkills ? (mainSkillData as EXSkill).ExtraSkills : [mainSkillData];

        // Bond Gear hint: normal skill upgrades when affection >= 20 AND gear T2
        const hasGearNormalUpgrade = id === 'normal' && !!(studentInfo.Skills as any).GearPublic;
        const hasGear = !!(studentInfo.Gear && 'TierUpMaterial' in studentInfo.Gear);
        const targetMeetsGearCondition = plan.target.affection >= 20 && (plan.target.gear ?? 0) >= 2;
        const showGearHint = hasGearNormalUpgrade && hasGear && !targetMeetsGearCondition;

        const currentLevel = plan.current[id as keyof typeof plan.current] as number;
        const targetLevel = plan.target[id as keyof typeof plan.target] as number;
        const skillMat = id === 'ex' ? studentInfo.SkillExMaterial : studentInfo.SkillMaterial;
        const skillMatAmt = id === 'ex' ? studentInfo.SkillExMaterialAmount : studentInfo.SkillMaterialAmount;
        const skillNeeds = calcSkillCostNeeds(currentLevel, targetLevel, skillMat, skillMatAmt, id === 'ex' ? 'EX' : 'Normal');

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
                      currentGear={plan.current.gear ?? 0}
                      targetGear={plan.target.gear ?? 0}
                    />
                  </div>
                ))}
              {showGearHint && (
                <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400">
                  <FiInfo className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] flex-1">{t('skillsTab.gearNormalHint', 'Bond Gear T2 + affection 20 upgrades this skill.')}</span>
                  <button
                    onClick={() => {
                      handlePlanChange('target.affection', Math.max(plan.target.affection, 20), true);
                      handlePlanChange('target.gear', 2, true);
                    }}
                    className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors shrink-0"
                  >
                    {t('skillsTab.setGearGoal', 'Set as goal')}
                  </button>
                </div>
              )}
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
              <InlineCostHint needs={skillNeeds} iconData={iconData} eventData={eventData} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
