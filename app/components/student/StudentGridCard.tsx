import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaHeart } from 'react-icons/fa';
import { StarRating } from '~/components/student/StarRating';
import { getCharacterStarValue } from '~/utils/raid/report';
import type { Character } from '~/types/raidReport';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student } from '~/types/plannerData';
import { CombatStylePortrait } from '~/components/student/CombatStylePortrait';
import { isUnrecruited } from '~/utils/student/recruitState';

export const formatSkills = (s: { ex: number; normal: number; passive: number; sub: number }) => {
  const f = (val: number, max: number) => (val === max ? 'M' : val);
  return `${f(s.ex, 5)}${f(s.normal, 10)}${f(s.passive, 10)}${f(s.sub, 10)}`;
};

export const formatEquip = (eq: number[]) => eq.join(' ');

interface StatChangeProps<T> {
  label?: ReactNode;
  current: T;
  target: T;
  labelFn?: (v: T) => ReactNode;
  className?: string;
  /** Unrecruited students have no meaningful current value, so only the goal is shown. */
  targetOnly?: boolean;
}

export const StatChange = <T,>({ label, current, target, labelFn = (v: T) => String(v), className = '', targetOnly = false }: StatChangeProps<T>) => {
  const isChanged = JSON.stringify(current) !== JSON.stringify(target);

  return (
    <div className={`min-w-0 overflow-hidden whitespace-nowrap ${className}`}>
      {label && <span className="mr-0.5 text-neutral-400 dark:text-neutral-500">{label}</span>}
      {targetOnly ? (
        <>
          <span className="text-neutral-400 dark:text-neutral-500">-</span>
          <span className="text-neutral-400 dark:text-neutral-500">→</span>
          <span className="text-blue-600 dark:text-blue-400">{labelFn(target)}</span>
        </>
      ) : isChanged ? (
        <>
          <span className="text-neutral-600 dark:text-neutral-300">{labelFn(current)}</span>
          <span className="text-neutral-400 dark:text-neutral-500">→</span>
          <span className="text-blue-600 dark:text-blue-400">{labelFn(target)}</span>
        </>
      ) : (
        <span className="text-neutral-600 dark:text-neutral-400">{labelFn(target)}</span>
      )}
    </div>
  );
};

export const StudentGridCard = ({ plan, studentInfo, onClick }: { plan: GrowthPlan; studentInfo: Student | null; onClick: () => void }) => {
  const { t } = useTranslation('planner');
  const { togglePlanSelection } = useGlobalStore();

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
  const isRankChanged = currentRankValue !== targetRankValue;
  const unrecruited = isUnrecruited(plan);

  const bulletColorMap: Record<string, string> = {
    Explosion: '#b62915',
    Pierce: '#bc8800',
    Mystic: '#206d9b',
    Sonic: '#9a46a8',
    Chemical: '#137973',
  };

  const bulletColor = studentInfo && 'BulletType' in studentInfo && studentInfo.BulletType ? bulletColorMap[studentInfo.BulletType] : null;
  const studentName = studentInfo ? studentInfo.Name : '-';

  return (
    <div
      onClick={onClick}
      className={`group relative flex h-full cursor-pointer flex-col border ${unrecruited ? 'border-dashed border-neutral-300' : 'border-neutral-200'} bg-white p-1.5 transition-colors hover:border-blue-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-blue-500 dark:hover:bg-neutral-800/80`}
      style={{
        borderTop: bulletColor ? `3px solid ${bulletColor}` : undefined,
      }}
    >
      <div className="absolute left-1 top-1 z-20 flex items-center gap-1">
        <input
          aria-label={t('ui.focusStudentAria', { name: studentName })}
          type="checkbox"
          checked={plan.isSelected ?? true}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onChange={(e) => {
            e.stopPropagation();
            togglePlanSelection(plan.uuid);
          }}
          className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
        />
      </div>

      <div className="flex flex-col items-center">
        <div className="relative w-full overflow-hidden rounded-xl border border-black/10 transition-transform group-hover:scale-[1.02]" style={{ backgroundColor: bulletColor || '#f5f5f5' }}>
          {studentInfo && plan.studentId !== null ? (
            <div className="aspect-square w-full">
              <CombatStylePortrait studentId={plan.studentId} alt={studentInfo.Name} />
            </div>
          ) : (
            <div className="flex aspect-square w-full items-center justify-center text-xs text-neutral-400 bg-neutral-100 dark:bg-neutral-700">?</div>
          )}
          {unrecruited && <span className="absolute right-1 top-1 z-10 rounded bg-neutral-900/70 px-1 py-0.5 text-[9px] font-bold leading-none text-white">{t('growthCard.unrecruited')}</span>}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-1 pt-5">
            <p className="truncate text-center text-[10px] font-bold leading-none text-white" title={studentName}>
              {studentName}
            </p>
          </div>
        </div>
        <div className="mt-0.5 scale-[0.72]">
          {isRankChanged ? (
            <div className="flex items-center gap-0.5 whitespace-nowrap">
              <StarRating n={currentRankValue} />
              <span className="mx-0.5 text-[10px] text-neutral-400">&gt;</span>
              <StarRating n={targetRankValue} />
            </div>
          ) : (
            <StarRating n={targetRankValue} />
          )}
        </div>
      </div>

      <div className="mt-auto h-13 border-t border-neutral-100 pt-1.5 font-mono text-[10px] leading-snug dark:border-neutral-700">
        <div className="mb-1 flex justify-between gap-0.5">
          <StatChange label="Lv" current={plan.current.level} target={plan.target.level} targetOnly={unrecruited} />
          <StatChange label={<FaHeart className="inline text-pink-400" size={8} />} current={plan.current.affection} target={plan.target.affection} targetOnly={unrecruited} />
        </div>
        <div className="mb-1 min-w-0 text-center">
          <StatChange current={formatSkills(plan.current)} target={formatSkills(plan.target)} targetOnly={unrecruited} />
        </div>
        <div className="min-w-0 text-center text-[9px]">
          <StatChange current={plan.current.equipment} target={plan.target.equipment} labelFn={formatEquip} targetOnly={unrecruited} />
        </div>
      </div>
    </div>
  );
};
