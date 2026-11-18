// SkillsTab.tsx

import { useTranslation } from 'react-i18next';
import { summonsOf, useSummonCatalog } from '~/features/students/data/useSummons';
import type { Locale } from '~/utils/i18n/config';
import { FiInfo } from 'react-icons/fi';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, EXSkill, IconData, Student, Skill } from '~/types/plannerData';
import { calcSkillCostNeeds } from '~/utils/calculatedGrowthNeeds';
import { SkillDisplay } from './SkillDisplay';
import { MinMaxControls } from './MinMaxControls';
import { InlineCostHint } from './InlineCostHint';

export const SKILL_CONFIG = [
  { id: 'ex', labelKey: 'game:skill.ex', skillKey: 'Ex', maxLevel: 5 },
  { id: 'normal', labelKey: 'game:skill.normal', skillKey: 'Public', maxLevel: 10 },
  {
    id: 'passive',
    labelKey: 'game:skill.passive',
    skillKey: 'Passive',
    maxLevel: 10,
  },
  { id: 'sub', labelKey: 'game:skill.sub', skillKey: 'ExtraPassive', maxLevel: 10 },
] as const;

interface SkillsTabProps {
  plan: GrowthPlan;
  studentInfo: Student | null;
  handlePlanChange: (field: string, value: string | number, isNumeric?: boolean) => void;
  iconData?: IconData;
  eventData?: EventData;
  /** Unrecruited plan: `current` is fixed to the recruit baseline. */
  currentLocked?: boolean;
}

export const SkillsTab = ({ plan, studentInfo, handlePlanChange, iconData, eventData, currentLocked = false }: SkillsTabProps) => {
  const { t, i18n } = useTranslation(['planner', 'game', 'students']);
  const summons = summonsOf(studentInfo ?? {}, useSummonCatalog(i18n.language as Locale));

  if (!studentInfo) return <div className="text-center p-4 text-xs text-neutral-400">Please select a student.</div>;

  return (
    <div className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-700">
      {SKILL_CONFIG.map(({ id, labelKey, skillKey, maxLevel }) => {
        const skillValue = studentInfo.Skills[skillKey as keyof typeof studentInfo.Skills];
        const mainSkillData: Skill | EXSkill = skillValue || ({} as Skill);

        const skillRenderList = skillKey === 'Ex' && (mainSkillData as EXSkill)?.ExtraSkills ? (mainSkillData as EXSkill).ExtraSkills : [mainSkillData];

        // Bond Gear hint: normal skill upgrades when affection >= 20 AND gear T2
        const hasGearNormalUpgrade = id === 'normal' && studentInfo.Skills.GearPublic !== undefined;
        const hasGear = studentInfo.Gear !== undefined && 'TierUpMaterial' in studentInfo.Gear;
        const targetMeetsGearCondition = plan.target.affection >= 20 && (plan.target.gear ?? 0) >= 2;
        const showGearHint = hasGearNormalUpgrade && hasGear && !targetMeetsGearCondition;

        // Summon skills use the level of the student skill they follow in game
        const summonSkills = summons.flatMap((summon) => summon.skills.filter((skill) => skill.follows === skillKey).map((skill) => ({ summon, skill })));

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
                skillRenderList.map((s: Skill, idx: number) => (
                  <div key={idx} className={idx > 0 ? 'mt-2 pt-2 border-t border-dashed border-neutral-100 dark:border-neutral-800' : ''}>
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
              {summonSkills.map(({ summon, skill }) => (
                <div key={`${summon.Id}-${skill.Name}`} className="mt-2 pt-2 border-t border-dashed border-neutral-100 dark:border-neutral-800">
                  <SkillDisplay
                    studentInfo={studentInfo}
                    skillKey={skillKey}
                    skillLabel={`${t('students:summon')} · ${summon.Name}`}
                    currentLevel={plan.current[id]}
                    targetLevel={plan.target[id]}
                    currentUW={plan.current.uw}
                    targetUW={plan.target.uw}
                    skillData={{ ...skill, Icon: '', Effects: [] }}
                    currentRank={plan.current.affection}
                    targetRank={plan.target.affection}
                    fixed
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
            <div className="w-full md:w-70 shrink-0 md:self-center">
              <div className="grid grid-cols-2 gap-3">
                {/* Current */}
                <div>
                  {currentLocked ? (
                    <p className="mb-0.5 text-[11px] font-bold tracking-tight text-neutral-500 dark:text-neutral-400">Current</p>
                  ) : (
                    <MinMaxControls label="Current" onMin={() => handlePlanChange(`current.${id}`, 1, true)} onMax={() => handlePlanChange(`current.${id}`, maxLevel, true)} />
                  )}
                  {currentLocked ? (
                    <div className="w-full rounded border border-neutral-200 bg-white p-1.5 text-center text-sm text-neutral-400 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-500">
                      -
                    </div>
                  ) : (
                    <select
                      value={plan.current[id]}
                      onChange={(e) => handlePlanChange(`current.${id}`, e.target.value, true)}
                      className="w-full p-1.5 text-sm ios-compact-14 border border-neutral-200 rounded bg-white dark:bg-neutral-700 dark:border-neutral-600 text-center"
                    >
                      {Array.from({ length: maxLevel }, (_, i) => i + 1).map((level) => (
                        <option key={level} value={level}>
                          Lv.{level}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Target */}
                <div>
                  <MinMaxControls label="Goal" onMin={() => handlePlanChange(`target.${id}`, plan.current[id], true)} onMax={() => handlePlanChange(`target.${id}`, maxLevel, true)} />
                  <select
                    value={plan.target[id]}
                    onChange={(e) => handlePlanChange(`target.${id}`, e.target.value, true)}
                    className="w-full p-1.5 text-sm ios-compact-14 border border-blue-200 rounded bg-white text-blue-600 font-bold dark:bg-neutral-700 dark:border-blue-900/50 dark:text-blue-400 text-center"
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
