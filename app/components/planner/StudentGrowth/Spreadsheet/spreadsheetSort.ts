import type { GrowthPlan } from '~/store/planner/useGlobalStore';

export interface Row {
  studentId: number;
  name: string;
  school: string;
  portrait: string | undefined;
  plan: GrowthPlan | null;
  hasGear: boolean;
  minStar: number;
}

interface SortField {
  field: string;
  direction: 'asc' | 'desc';
}

const NUMERIC_FIELDS = [
  'level',
  'star',
  'uwLevel',
  'affection',
  'affectionExp',
  'ex',
  'normal',
  'passive',
  'sub',
  'targetLevel',
  'targetStar',
  'targetUwLevel',
  'targetAffection',
  'currentEquipment0',
  'currentEquipment1',
  'currentEquipment2',
  'currentGear',
  'targetEquipment0',
  'targetEquipment1',
  'targetEquipment2',
  'targetGear',
];

function getFieldValue(row: Row, field: string): any {
  if (field === 'hasPlan') return row.plan ? 1 : 0;
  if (field === 'school') return row.school;
  if (field === 'name') return row.name;

  if (!row.plan) return null;

  if (field === 'acquiredDate') return row.plan.acquiredDate || '';

  if (field === 'level') return row.plan.current.level || 0;
  if (field === 'star') return row.plan.current.star || 0;
  if (field === 'uwLevel') return row.plan.current.uwLevel || 0;
  if (field === 'affection') return row.plan.current.affection || 0;
  if (field === 'affectionExp') return row.plan.current.affectionExp || 0;

  if (field === 'targetLevel') return row.plan.target.level || 0;
  if (field === 'targetStar') return row.plan.target.star || 0;
  if (field === 'targetUwLevel') return row.plan.target.uwLevel || 0;
  if (field === 'targetAffection') return row.plan.target.affection || 0;

  if (field === 'currentEquipment0') return row.plan.current.equipment[0] || 0;
  if (field === 'currentEquipment1') return row.plan.current.equipment[1] || 0;
  if (field === 'currentEquipment2') return row.plan.current.equipment[2] || 0;
  if (field === 'currentGear') return row.plan.current.gear || 0;

  if (field === 'targetEquipment0') return row.plan.target.equipment[0] || 0;
  if (field === 'targetEquipment1') return row.plan.target.equipment[1] || 0;
  if (field === 'targetEquipment2') return row.plan.target.equipment[2] || 0;
  if (field === 'targetGear') return row.plan.target.gear || 0;

  if (['ex', 'normal', 'passive', 'sub'].includes(field)) {
    return (row.plan.current as any)[field] || 0;
  }

  return null;
}

function compareValues(a: any, b: any, field: string): number {
  if (field === 'hasPlan' || field === 'school' || field === 'name' || field === 'acquiredDate') {
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }
    return (a || 0) - (b || 0);
  }

  return (a || 0) - (b || 0);
}

export function compareRows(a: Row, b: Row, sortStack: SortField[]): number {
  // Added rows are always displayed first
  const aHasPlan = a.plan ? 1 : 0;
  const bHasPlan = b.plan ? 1 : 0;
  if (aHasPlan !== bHasPlan) {
    return bHasPlan - aHasPlan;
  }

  // Selected rows are displayed first
  const aSelected = a.plan?.isSelected !== false ? 1 : 0;
  const bSelected = b.plan?.isSelected !== false ? 1 : 0;
  if (aSelected !== bSelected) {
    return bSelected - aSelected;
  }

  // Iterate through sort stack in reverse order (most recent click has higher priority)
  // console.log('')
  for (let i = sortStack.length - 1; i >= 0; i--) {
    const { field, direction } = sortStack[i];
    let cmp = 0;

    // Rows without plans are always at the back
    if (NUMERIC_FIELDS.includes(field) && !a.plan && !b.plan) {
      cmp = 0;
    } else if (NUMERIC_FIELDS.includes(field) && !a.plan) {
      cmp = 1;
    } else if (NUMERIC_FIELDS.includes(field) && !b.plan) {
      cmp = -1;
    } else {
      const aValue = getFieldValue(a, field);
      const bValue = getFieldValue(b, field);
      cmp = compareValues(aValue, bValue, field);
    }

    if (cmp !== 0) {
      return direction === 'asc' ? cmp : -cmp;
    }
  }

  // If no sort, order by Academy > Name
  if (a.school !== b.school) return a.school.localeCompare(b.school);
  return a.name.localeCompare(b.name);
}
