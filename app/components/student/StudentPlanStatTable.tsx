import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import type { GrowthPlan } from '~/types/growthPlan';
import type { StudentData } from '~/types/plannerData';
import { PLAN_STAT_KEYS, resolvePlanStats, type PlanStatKey } from '~/utils/student/planStats';

const PASSIVE_STORAGE_KEY = 'students.planStatsPassive';

const STAT_LABEL_KEYS = { MaxHP: 'Buff_MAXHP', AttackPower: 'Buff_ATK', DefensePower: 'Buff_DEF', HealPower: 'Buff_HealPower' } as const satisfies Record<PlanStatKey, string>;

// Stats worked out from the plan's current and target values, with the same formula as SchaleDB's stat preview
export function StudentPlanStatTable({ plan, allStudents }: { plan: GrowthPlan; allStudents: StudentData }) {
  const { t } = useTranslation('students');
  const { t: stat } = useTranslation('stat');
  const growthPlans = useGlobalStore((state) => state.growthPlans);
  const [includePassive, setIncludePassive] = useState(false);
  useEffect(() => {
    try {
      setIncludePassive(localStorage.getItem(PASSIVE_STORAGE_KEY) === '1');
    } catch {
      // Storage can be blocked; the in-game basis stays
    }
  }, []);
  const togglePassive = () => {
    setIncludePassive(!includePassive);
    try {
      localStorage.setItem(PASSIVE_STORAGE_KEY, includePassive ? '0' : '1');
    } catch {
      // The choice still applies until the page is closed
    }
  };
  const target = useMemo(() => resolvePlanStats(plan, 'target', allStudents, growthPlans, { includePassive }), [plan, allStudents, growthPlans, includePassive]);
  // An unrecruited plan has no real current values
  const current = useMemo(() => resolvePlanStats(plan, 'current', allStudents, growthPlans, { includePassive }), [plan, allStudents, growthPlans, includePassive]);
  if (!target) return null;
  return (
    <div className="space-y-1.5 border-b border-neutral-100 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        {PLAN_STAT_KEYS.map((key) => (
          <div key={key} className="flex items-baseline gap-1.5">
            <dt className="text-neutral-500 dark:text-neutral-400">{stat(STAT_LABEL_KEYS[key])}</dt>
            <dd className="font-mono font-semibold">
              {current && current[key] === target[key] ? (
                <span className="text-neutral-500 dark:text-neutral-200">{target[key].toLocaleString()}</span>
              ) : (
                <>
                  <span className="text-neutral-500 dark:text-neutral-200">{current ? current[key].toLocaleString() : '-'}</span>
                  <span className="mx-1 text-[10px] font-normal text-neutral-500 dark:text-neutral-400">→</span>
                  <span className="text-blue-600 dark:text-blue-400">{target[key].toLocaleString()}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
        <input type="checkbox" checked={includePassive} onChange={togglePassive} className="h-3.5 w-3.5 cursor-pointer rounded border-neutral-300 text-blue-600" />
        {t('planStats.passive')}
      </label>
      <p className="text-[11px] text-neutral-400">{t('planStats.note')}</p>
    </div>
  );
}
