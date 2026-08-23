import type { ReactNode } from 'react';
import { FaHeart } from 'react-icons/fa';
import { StarRating } from '~/components/StarRating';
import { getCharacterStarValue, type Character } from '~/components/dashboard/common';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student } from '~/types/plannerData';

const formatSkills = (s: { ex: number; normal: number; passive: number; sub: number }) => {
  const f = (val: number, max: number) => (val === max ? 'M' : val);
  return `${f(s.ex, 5)}${f(s.normal, 10)}${f(s.passive, 10)}${f(s.sub, 10)}`;
};

const formatEquip = (eq: number[]) => eq.join('');

interface StatChangeProps<T> {
  label?: ReactNode;
  current: T;
  target: T;
  labelFn?: (v: T) => ReactNode;
  className?: string;
}

const StatChange = <T,>({ label, current, target, labelFn = (v: T) => String(v), className = '' }: StatChangeProps<T>) => {
  const isChanged = JSON.stringify(current) !== JSON.stringify(target);

  return (
    <div className={`min-w-0 overflow-hidden whitespace-nowrap ${className}`}>
      {label && <span className="mr-0.5 text-neutral-400 dark:text-neutral-500">{label}</span>}
      {isChanged ? (
        <>
          <span className="text-neutral-500 dark:text-neutral-400">{labelFn(current)}</span>
          <span className="mx-px text-neutral-300 dark:text-neutral-600">&gt;</span>
          <span className="text-blue-600 dark:text-blue-400">{labelFn(target)}</span>
        </>
      ) : (
        <span className="text-neutral-600 dark:text-neutral-400">{labelFn(target)}</span>
      )}
    </div>
  );
};

export const StudentGridCard = ({ plan, studentInfo, portraitBase64, onClick }: { plan: GrowthPlan; studentInfo: Student | null; portraitBase64: string | undefined; onClick: () => void }) => {
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
      className="group relative flex h-full cursor-pointer flex-col border border-neutral-200 bg-white p-1.5 transition-colors hover:border-blue-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-blue-500 dark:hover:bg-neutral-800/80"
      style={{
        borderTop: bulletColor ? `3px solid ${bulletColor}` : undefined,
      }}
    >
      <div className="absolute left-1 top-1 z-20 flex items-center gap-1">
        <input
          aria-label={`${studentName} selected`}
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
          {studentInfo && portraitBase64 ? (
            <img src={`data:image/webp;base64,${portraitBase64}`} alt={studentInfo.Name} className="w-full aspect-square object-cover" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center text-xs text-neutral-400 bg-neutral-100 dark:bg-neutral-700">?</div>
          )}
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

      <div className="mt-auto border-t h-13 border-neutral-100 pt-1.5 font-mono text-[10px] leading-snug dark:border-neutral-700">
        <div className="mb-1 flex justify-between gap-0.5">
          <StatChange label="Lv" current={plan.current.level} target={plan.target.level} />
          <StatChange label={<FaHeart className="inline text-pink-400" size={8} />} current={plan.current.affection} target={plan.target.affection} />
        </div>
        <div className="mb-1 min-w-0 text-center">
          <StatChange current={plan.current} target={plan.target} labelFn={(v) => formatSkills(v)} />
        </div>
        <div className="min-w-0 text-center">
          <StatChange current={plan.current.equipment} target={plan.target.equipment} labelFn={(v) => formatEquip(v)} />
        </div>
      </div>
    </div>
  );
};
