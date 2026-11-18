import { useTranslation } from 'react-i18next';
import { FaHeart } from 'react-icons/fa';
import { formatEquip, formatSkills, StatChange } from '~/components/student/StudentGridCard';
import { StarRating } from '~/components/student/StarRating';
import type { Character } from '~/types/raidReport';
import { getCharacterStarValue } from '~/utils/raid/report';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import type { GrowthPlan } from '~/types/growthPlan';
import type { CardField } from '../logic/cardFields';
import { isUnrecruited } from '~/utils/student/recruitState';

// Star rank, or the unique weapon star once one is unlocked (the same value the planner cards show)
const rankValue = (block: Pick<GrowthPlan['current'], 'star' | 'uw'>) => getCharacterStarValue({ hasWeapon: block.uw > 0, star: block.star, weaponStar: block.uw } as Character);

// Current rank (and the target while it differs) over the bottom-left of the portrait
export function StudentPlanStars({ plan }: { plan: GrowthPlan | undefined }) {
  if (!plan) return null;
  const current = rankValue(plan.current);
  const target = rankValue(plan.target);
  return (
    <div className="pointer-events-none absolute -bottom-1 left-0.5 flex items-center gap-0.5 whitespace-nowrap" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}>
      <StarRating n={current} size={22} />
      {current !== target && (
        <>
          <span className="text-xs font-bold text-white" aria-hidden>
            &gt;
          </span>
          <StarRating n={target} size={22} />
        </>
      )}
    </div>
  );
}

// Selection checkbox over the top-left corner of the portrait
export function StudentPlanSelect({ name, plan }: { name: string; plan: GrowthPlan | undefined }) {
  const { t } = useTranslation('planner');
  const togglePlanSelection = useGlobalStore((state) => state.togglePlanSelection);
  if (!plan) return null;
  return (
    <input
      type="checkbox"
      aria-label={t('ui.focusStudentAria', { name })}
      checked={plan.isSelected}
      onChange={() => togglePlanSelection(plan.uuid)}
      className="absolute left-1 top-1 z-10 h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600"
    />
  );
}

// Recruit state under the name, only for a plan whose student is not recruited yet
export function StudentUnrecruitedLabel({ plan }: { plan: GrowthPlan | undefined }) {
  const { t } = useTranslation('planner');
  if (!plan || !isUnrecruited(plan)) return null;
  return (
    <div className="flex px-1.5 pb-1">
      <span className="whitespace-nowrap rounded bg-neutral-900/70 px-1 py-px text-[10px] font-bold leading-none text-white">{t('growthCard.unrecruited')}</span>
    </div>
  );
}

// The numbers of the plan the reader asked the cards to show, as current→target
export function StudentPlanStats({ plan, fields }: { plan: GrowthPlan | undefined; fields: readonly CardField[] }) {
  if (!plan) return null;
  const targetOnly = isUnrecruited(plan);
  const level = fields.includes('level');
  const affection = fields.includes('affection');
  const skills = fields.includes('skills');
  const equipment = fields.includes('equipment');
  if (!level && !affection && !skills && !equipment) return null;
  return (
    <div className="flex flex-col gap-0.5 px-1.5 pb-1 font-mono text-[10px] leading-snug">
      {/* Level and bond share a row while they fit and wrap onto two lines once a change makes them long */}
      {(level || affection) && (
        <div className="flex flex-wrap justify-between gap-x-1">
          {level && <StatChange label="Lv" current={plan.current.level} target={plan.target.level} targetOnly={targetOnly} />}
          {affection && <StatChange label={<FaHeart className="inline text-pink-400" size={8} />} current={plan.current.affection} target={plan.target.affection} targetOnly={targetOnly} />}
        </div>
      )}
      {skills && <StatChange current={formatSkills(plan.current)} target={formatSkills(plan.target)} targetOnly={targetOnly} />}
      {equipment && <StatChange className="text-[9px]" current={plan.current.equipment} target={plan.target.equipment} labelFn={formatEquip} targetOnly={targetOnly} />}
    </div>
  );
}
