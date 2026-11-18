import type { GrowthPlan } from '~/types/growthPlan';
import type { PlanStatKey } from '~/utils/student/planStats';
import type { studentSummary } from '../data/publicStudent';

type Summary = ReturnType<typeof studentSummary>;

export const DIRECTORY_SORTS = [
  'default',
  'name',
  'id',
  'star',
  'birthday',
  'height',
  'attack',
  'hp',
  'defense',
  'heal',
  'planCurrentLevel',
  'planTargetLevel',
  'planCurrentStar',
  'planTargetStar',
  'planAcquired',
  'planCurrentAttack',
  'planTargetAttack',
  'planCurrentHp',
  'planTargetHp',
  'planCurrentDefense',
  'planTargetDefense',
  'planCurrentHeal',
  'planTargetHeal',
] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

/** Sorts that read the reader's own growth plan; students without a plan have no value and end up last. */
export const PLAN_SORTS: readonly DirectorySort[] = ['planCurrentLevel', 'planTargetLevel', 'planCurrentStar', 'planTargetStar', 'planAcquired'];

/** Sorts on a stat worked out from the plan; they also need the full student catalog to be calculated. */
export const PLAN_STAT_SORTS: Partial<Record<DirectorySort, { side: 'current' | 'target'; stat: PlanStatKey }>> = {
  planCurrentAttack: { side: 'current', stat: 'AttackPower' },
  planTargetAttack: { side: 'target', stat: 'AttackPower' },
  planCurrentHp: { side: 'current', stat: 'MaxHP' },
  planTargetHp: { side: 'target', stat: 'MaxHP' },
  planCurrentDefense: { side: 'current', stat: 'DefensePower' },
  planTargetDefense: { side: 'target', stat: 'DefensePower' },
  planCurrentHeal: { side: 'current', stat: 'HealPower' },
  planTargetHeal: { side: 'target', stat: 'HealPower' },
};

/** The value a plan stat sort reads for a student; null when it cannot be worked out. */
export type PlanStatOf = (studentId: number) => number | null;

export type PlanOf = (studentId: number) => GrowthPlan | undefined;

export function parseDirectorySort(value: string | null): DirectorySort {
  return DIRECTORY_SORTS.find((sort) => sort === value) ?? 'default';
}

/** Sort key where a missing value is `null`, which always ends up last whatever the direction. */
function key(student: Summary, sort: DirectorySort, planOf?: PlanOf, statOf?: PlanStatOf): number | string | null {
  const statSort = PLAN_STAT_SORTS[sort];
  if (statSort) return statOf?.(student.Id) || null;
  const plan = PLAN_SORTS.includes(sort) ? planOf?.(student.Id) : undefined;
  switch (sort) {
    case 'planCurrentLevel':
      return plan?.current.level ?? null;
    case 'planTargetLevel':
      return plan?.target.level ?? null;
    case 'planCurrentStar':
      return plan ? plan.current.star + plan.current.uw : null;
    case 'planTargetStar':
      return plan ? plan.target.star + plan.target.uw : null;
    case 'planAcquired':
      return plan?.acquiredDate || null;
    case 'name':
      return student.Name;
    case 'id':
      return student.Id;
    case 'star':
      return student.StarGrade;
    case 'birthday': {
      const [month, day] = student.BirthDay.split('/').map(Number);
      return month && day ? month * 100 + day : null;
    }
    case 'height':
      return parseInt(student.CharHeightMetric, 10) || null;
    case 'attack':
      return student.AttackPower100 || null;
    case 'hp':
      return student.MaxHP100 || null;
    case 'defense':
      return student.DefensePower100 || null;
    case 'heal':
      return student.HealPower100 || null;
    default:
      return student.DefaultOrder ?? null;
  }
}

/** Sorts a copy of the list. Ties fall back to the in-game order, then the name. */
export function sortDirectory(students: Summary[], sort: DirectorySort, reversed: boolean, planOf?: PlanOf, statOf?: PlanStatOf): Summary[] {
  const direction = reversed ? -1 : 1;
  return [...students].sort((a, b) => {
    const ka = key(a, sort, planOf, statOf);
    const kb = key(b, sort, planOf, statOf);
    if (ka !== kb) {
      if (ka === null) return 1;
      if (kb === null) return -1;
      return direction * (typeof ka === 'string' ? ka.localeCompare(String(kb)) : ka - Number(kb));
    }
    const orderA = a.DefaultOrder ?? Number.POSITIVE_INFINITY;
    const orderB = b.DefaultOrder ?? Number.POSITIVE_INFINITY;
    return orderA !== orderB ? orderA - orderB : a.Name.localeCompare(b.Name);
  });
}
