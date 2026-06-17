// app/components/planner/StudentGrowth/StudentGrowthSummaryCard.tsx

import { useTranslation } from 'react-i18next';
import { getCharacterStarValue, type Character } from '~/components/dashboard/common';
import { StarRating } from '~/components/StarRating';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { StudentData, StudentPortraitData } from '~/types/plannerData';

interface StudentGrowthSummaryCardProps {
  plan: GrowthPlan;
  allStudents: StudentData;
  studentPortraits: StudentPortraitData;
  isSelected: boolean;
  onClick: () => void;
  showEquipment?: boolean;
}

const skillSortName = (data: GrowthPlan['current'] | GrowthPlan['target']) => {
  const ex = data.ex;
  const normal = data.normal;
  const passive = data.passive;
  const sub = data.sub;
  return `${ex == 5 ? 'M' : ex}${normal == 10 ? 'M' : normal}${passive == 10 ? 'M' : passive}${sub == 10 ? 'M' : sub}`;
};

// Remove getEquipmentTierLabel helper

export const StudentGrowthSummaryCard = ({
  plan,
  allStudents,
  studentPortraits,
  isSelected,
  onClick,
  // Receive props
  showEquipment = false,
}: StudentGrowthSummaryCardProps) => {
  const studentInfo = plan.studentId ? allStudents[plan.studentId] : null;
  const { t } = useTranslation('planner');

  // Remove equipmentNeeds useMemo

  if (!studentInfo) {
    // ... (Existing "Select Student" placeholder card) ...
    return (
      <div
        onClick={onClick}
        className={`p-4 border rounded-lg cursor-pointer text-center transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700
          ${isSelected ? 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-blue-900 dark:border-blue-500 dark:text-blue-200' : 'bg-white border-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400'}
        `}
      >
        {t('growthCard.selectStudentPlaceholder')}
      </div>
    );
  }

  const currentRankValue = getCharacterStarValue({
    hasWeapon: plan.current.uw > 0,
    star: plan.current.star,
    weaponStar: plan.current.uw,
  } as Character);
  const targetRankValue = getCharacterStarValue({
    hasWeapon: plan.target.uw > 0,
    star: plan.target.star,
    weaponStar: plan.target.uw,
  } as Character);
  const currentRank = plan.current.uw > 0 ? `uw${plan.current.uw}★` : `${plan.current.star}★`;
  const targetRank = plan.target.uw > 0 ? `uw${plan.target.uw}★` : `${plan.target.star}★`;

  // --- Generate Equipment Tier Text ---
  const currentEqTiers = plan.current.equipment.map((t) => `${t}T`).join(' '); // "1T 1T 1T"
  const targetEqTiers = plan.target.equipment.map((t) => `${t}T`).join(' '); // "4T 4T 4T"
  const showEqTierChange = showEquipment && currentEqTiers !== targetEqTiers;
  // ---

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-xl shadow-md hover:shadow-lg border-2 transition-all cursor-pointer ${isSelected ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/50' : 'border-transparent bg-white dark:bg-neutral-800'}`}
    >
      <div className="flex items-center gap-4">
        {plan.studentId && (
          <img
            src={`data:image/webp;base64,${studentPortraits[plan.studentId]}`}
            alt={studentInfo.Name}
            className="w-16 h-16 rounded-full object-cover border-2 border-neutral-200 dark:border-neutral-700"
          />
        )}
        <div className="grow min-w-0">
          <p className="font-bold text-lg text-neutral-800 dark:text-neutral-100 truncate">{studentInfo.Name}</p>
          {/* Changed to flex-col gap-1, added equipment tier text */}
          <div className="flex flex-col items-start gap-1 text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            {plan.current.level != plan.target.level && (
              <span>
                Lv.{plan.current.level} → <span className="font-semibold text-blue-600 dark:text-blue-400">Lv.{plan.target.level}</span>
              </span>
            )}
            {currentRank != targetRank && (
              <span className="flex flex-row gap-x-1 items-center">
                <StarRating n={currentRankValue} /> → <StarRating n={targetRankValue} />{' '}
              </span>
            )}
            {skillSortName(plan.current) != skillSortName(plan.target) && (
              <span>
                {skillSortName(plan.current)} → <span className="font-semibold text-blue-600 dark:text-blue-400">{skillSortName(plan.target)}</span>
              </span>
            )}
            {/* Equipment tier change text */}
            {showEqTierChange && (
              <span className="font-mono text-xs">
                {currentEqTiers} → <span className="font-semibold text-blue-600 dark:text-blue-400">{targetEqTiers}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* --- Equipment Requirement Icon Display Area --- */}
    </div>
  );
};
