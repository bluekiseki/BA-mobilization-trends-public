// app/components/planner/StudentGrowth/SkillDisplay.tsx

import { useTranslation } from 'react-i18next';
import type { Skill, Student } from '~/types/plannerData';

// --- Helper: Format Skill Descriptions (Buffs/Debuffs) ---
export const formatSkillBuffDesc = (str: string, t: any) => {
  return str
    .replace(/<b:(\w+)>/g, (_, param) => `<strong class="underline">${t(`stat:Buff_${param}`, { defaultValue: param })}</strong>`)
    .replace(/<d:(\w+)>/g, (_, param) => `<strong class="underline">${t(`stat:Debuff_${param}`, { defaultValue: param })}</strong>`)
    .replace(/<s:(\w+)>/g, (_, param) => `<strong class="underline">${t(`stat:Special_${param}`, { defaultValue: param })}</strong>`)
    .replace(/<c:(\w+)>/g, (_, param) => `<strong class="underline">${t(`stat:CC_${param}`, { defaultValue: param })}</strong>`)
    .replace(/\\n/g, '<br/>');
};

interface SkillDisplayProps {
  studentInfo: Student;
  skillKey: 'Ex' | 'Public' | 'Passive' | 'ExtraPassive';
  skillLabel: string;
  currentLevel: number;
  targetLevel: number;
  currentUW: number;
  targetUW: number;
  skillData: Skill | undefined;
  currentRank: number; // Affection Rank
  targetRank: number; // Affection Rank
}

export const SkillDisplay = ({ studentInfo, skillKey, skillLabel, currentLevel, targetLevel, currentUW, targetUW, skillData, currentRank, targetRank }: SkillDisplayProps) => {
  const { t } = useTranslation(['planner', 'stat']);

  // --- Logic: Determine Effective Skill Data (Weapon/Gear upgrades) ---
  let currentSkillData: Skill | undefined = skillData;
  let targetSkillData: Skill | undefined = skillData;
  let isDescriptionChanged = false;

  // 1. Unique Weapon Passive Upgrade (2-Star UW)
  if (skillKey === 'Passive') {
    const hasWeaponPassive = !!studentInfo.Skills.WeaponPassive;
    if (hasWeaponPassive) {
      if (currentUW >= 2) currentSkillData = studentInfo.Skills.WeaponPassive;
      if (targetUW >= 2) targetSkillData = studentInfo.Skills.WeaponPassive;

      // Check if upgrading crosses the UW2 threshold
      if (currentUW >= 2 !== targetUW >= 2) {
        isDescriptionChanged = true;
      }
    }
  }

  // 2. Bond Gear Normal Skill Upgrade (Bond 20, T2 Gear)
  // Note: Assuming logic based on Affection Rank >= 20 for simplicity as per snippet
  if (skillKey === 'Public') {
    const hasGearPublic = !!studentInfo.Skills.GearPublic;
    if (hasGearPublic) {
      if (currentRank >= 20) currentSkillData = studentInfo.Skills.GearPublic;
      if (targetRank >= 20) targetSkillData = studentInfo.Skills.GearPublic;

      if (currentRank >= 20 !== targetRank >= 20) {
        isDescriptionChanged = true;
      }
    }
  }

  if (!currentSkillData || !targetSkillData) return null;

  // --- Logic: Text Interpolation ---
  const formatSkillDesc = (data: Skill, level: number) => {
    if (!data.Desc || !data.Parameters) return '';
    const rawDesc = data.Desc.replace(/<\?(\d+)>/g, (match, paramIndexStr) => {
      const paramIndex = parseInt(paramIndexStr, 10) - 1;
      const levelIndex = level - 1;
      const val = data.Parameters?.[paramIndex]?.[levelIndex];

      return val !== undefined ? `<strong class="text-blue-600 dark:text-blue-400">${val}</strong>` : match;
    });
    return formatSkillBuffDesc(rawDesc, t);
  };

  const formatSkillDiffDesc = (data: Skill, levels: [number, number]) => {
    if (!data.Desc || !data.Parameters) return '';

    const rawDesc = data.Desc.replace(/<\?(\d+)>/g, (match, paramIndexStr) => {
      const paramIndex = parseInt(paramIndexStr, 10) - 1;
      const [curLvl, tarLvl] = levels;
      const curVal = data.Parameters?.[paramIndex]?.[curLvl - 1];
      const tarVal = data.Parameters?.[paramIndex]?.[tarLvl - 1];

      if (curVal === undefined || tarVal === undefined) return match;

      if (curVal === tarVal) {
        return `<strong class="text-neutral-700 dark:text-neutral-300 font-normal">${curVal}</strong>`;
      }

      return (
        `<strong class="font-bold whitespace-nowrap">` +
        `<span class="text-neutral-500 dark:text-neutral-400">${curVal}</span>` +
        `<span class="text-neutral-400 dark:text-neutral-500 mx-0.5">→</span>` +
        `<span class="text-blue-600 dark:text-blue-400">${tarVal}</span>` +
        `</strong>`
      );
    });
    return formatSkillBuffDesc(rawDesc, t);
  };

  const currentDesc = formatSkillDesc(currentSkillData, currentLevel);
  const targetDesc = formatSkillDesc(targetSkillData, targetLevel);
  const changeDesc = formatSkillDiffDesc(targetSkillData, [currentLevel, targetLevel]);

  const currentCost = skillKey === 'Ex' ? currentSkillData.Cost?.[currentLevel - 1] : null;
  const targetCost = skillKey === 'Ex' ? targetSkillData.Cost?.[targetLevel - 1] : null;

  return (
    <div className="text-xs flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-baseline mb-2">
        <div className="flex items-center gap-2">
          <span className="bg-gray-600 dark:bg-gray-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">{skillLabel}</span>
          <span className="font-bold text-gray-900 dark:text-neutral-200 truncate pr-2">{targetSkillData.Name}</span>
        </div>

        {/* Cost (Ex Only) */}
        {skillKey === 'Ex' && currentCost !== undefined && targetCost !== undefined && (
          <div className="text-xs shrink-0 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded border border-yellow-100 dark:border-yellow-800/50">
            <span className="font-bold text-gray-500 dark:text-gray-400">Cost: </span>
            <span className="font-bold text-gray-700 dark:text-gray-300">{currentCost}</span>
            {targetCost !== currentCost && (
              <>
                <span className="text-gray-400 mx-1">→</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{targetCost}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Description Body */}
      <div className="font-light text-gray-600 dark:text-neutral-300 space-y-2 grow bg-gray-50 dark:bg-neutral-700/30 p-2 rounded leading-relaxed">
        {currentLevel === targetLevel && !isDescriptionChanged ? (
          <div dangerouslySetInnerHTML={{ __html: currentDesc }} />
        ) : (
          <>
            {isDescriptionChanged ? (
              <div className="flex flex-col gap-1">
                <div className="opacity-70" dangerouslySetInnerHTML={{ __html: currentDesc }} />
                <div className="text-center text-blue-500 text-[10px] font-bold">▼ UPGRADE ▼</div>
                <div
                  className="p-1.5 bg-blue-50/50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-800/30 text-gray-800 dark:text-gray-200"
                  dangerouslySetInnerHTML={{ __html: targetDesc }}
                />
              </div>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: changeDesc }} />
            )}
          </>
        )}
      </div>
    </div>
  );
};
