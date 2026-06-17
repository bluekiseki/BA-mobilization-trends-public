import { FaCopy, FaHeart } from 'react-icons/fa';
import { StarRating } from '~/components/StarRating';
import { getCharacterStarValue, type Character } from '~/components/dashboard/common';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student } from '~/types/plannerData';

const formatSkills = (s: { ex: number; normal: number; passive: number; sub: number }) => {
  const f = (val: number, max: number) => (val === max ? 'M' : val);
  return `${f(s.ex, 5)}${f(s.normal, 10)}${f(s.passive, 10)}${f(s.sub, 10)}`;
};

const formatEquip = (eq: number[]) => eq.join('/');

const StatChange = <T,>({
  current,
  target,
  labelFn = (v: T) => String(v),
  icon = null,
  className = '',
}: {
  current: T;
  target: T;
  labelFn?: (v: T) => React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) => {
  const isChanged = JSON.stringify(current) !== JSON.stringify(target);

  return (
    <div className={`flex items-center justify-center gap-0.5 ${className}`}>
      {icon && <span className="mr-0.5 opacity-70">{icon}</span>}
      {isChanged ? (
        <>
          <span className="text-neutral-500">{labelFn(current)}</span>
          <span className="text-neutral-300 mx-0.5 text-[8px]">→</span>
          <span className="text-blue-600 dark:text-blue-400 font-bold">{labelFn(target)}</span>
        </>
      ) : (
        <span className="text-neutral-600 dark:text-neutral-400">{labelFn(target)}</span>
      )}
    </div>
  );
};

export const StudentGridCard = ({
  plan,
  studentInfo,
  portraitBase64,
  onClick,
  onDuplicate,
}: {
  plan: GrowthPlan;
  studentInfo: Student | null;
  portraitBase64: string | undefined;
  onClick: () => void;
  onDuplicate: (e: React.MouseEvent) => void;
}) => {
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

  const isTargetDifferent =
    plan.current.level !== plan.target.level ||
    plan.current.affection !== plan.target.affection ||
    JSON.stringify(plan.current.equipment) !== JSON.stringify(plan.target.equipment) ||
    formatSkills(plan.current) !== formatSkills(plan.target) ||
    isRankChanged;

  const bulletColorMap: Record<string, string> = {
    Explosion: '#b62915',
    Pierce: '#bc8800',
    Mystic: '#206d9b',
    Sonic: '#9a46a8',
    Chemical: '#137973',
  };

  const bulletColor = studentInfo && 'BulletType' in studentInfo && studentInfo.BulletType ? bulletColorMap[studentInfo.BulletType] : null;

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col bg-white dark:bg-neutral-800 border-x border-b border-neutral-200 dark:border-neutral-700 rounded-lg p-2 hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition-all cursor-pointer h-full"
      style={{
        borderTop: bulletColor ? `4px solid ${bulletColor}` : '1px solid #e5e7eb',
      }}
    >
      {}
      <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 z-20">
        <input
          type="checkbox"
          checked={plan.isSelected ?? true}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onChange={(e) => {
            e.stopPropagation();
            togglePlanSelection(plan.uuid);
          }}
          className="w-3.5 h-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 cursor-pointer transition-transform hover:scale-110"
        />
        {}
        {isTargetDifferent && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_4px_rgba(59,130,246,0.5)]"></div>}
      </div>

      {}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate(e);
        }}
        className="absolute top-1 right-1 p-1 text-neutral-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors z-10 opacity-0 group-hover:opacity-100"
        title="Duplicate Settings"
      >
        <FaCopy size={10} />
      </button>

      {}
      <div className="flex flex-col items-center mb-1 mt-2">
        {' '}
        {}
        <div className="relative mb-1">
          {studentInfo && portraitBase64 ? (
            <div
              className="w-12 h-12 rounded-full border border-black/10 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform shadow-sm"
              style={{ backgroundColor: bulletColor || '#f3f4f6' }}
            >
              <img src={`data:image/webp;base64,${portraitBase64}`} alt={studentInfo.Name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-neutral-400 text-xs">?</div>
          )}
        </div>
        {}
        <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 truncate w-full text-center px-1 mb-0.5">{studentInfo ? studentInfo.Name : '-'}</h3>
        {/* Rank (Stars) */}
        <div className="h-3 mb-1 flex items-center justify-center">
          {isRankChanged ? (
            <div className="flex items-center gap-0.5 scale-[0.85] origin-center whitespace-nowrap">
              <StarRating n={currentRankValue} />
              <span className="text-neutral-400 mx-1">→</span>
              <StarRating n={targetRankValue} />
            </div>
          ) : (
            <div className="scale-[0.85] origin-center">
              <StarRating n={targetRankValue} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Stats Grid */}
      <div className="mt-auto flex flex-col gap-0.5 bg-neutral-50 dark:bg-neutral-900/50 rounded p-1.5 text-[10px] font-mono leading-tight">
        {/* Row 1: Level & Affection */}
        <div className="flex justify-between items-center border-b border-neutral-100 dark:border-neutral-700 pb-0.5 mb-0.5">
          {/* Level */}
          <StatChange current={plan.current.level} target={plan.target.level} labelFn={(v) => `Lv.${v}`} />
          {/* Affection (Bond) */}
          <StatChange current={plan.current.affection} target={plan.target.affection} icon={<FaHeart size={8} className="text-pink-400" />} labelFn={(v) => v} />
        </div>

        {/* Row 2: Skills */}
        <div className="flex justify-center border-b border-neutral-100 dark:border-neutral-700 pb-0.5 mb-0.5">
          <StatChange current={plan.current} target={plan.target} labelFn={(v) => formatSkills(v)} />
        </div>

        {/* Row 3: Equipment */}
        <div className="flex justify-center">
          <StatChange current={plan.current.equipment} target={plan.target.equipment} labelFn={(v) => formatEquip(v)} />
        </div>
      </div>

      {/* Change Indicator Dot */}
      {isTargetDifferent && <div className="absolute top-2 left-2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-sm"></div>}
    </div>
  );
};
