import { describe, expect, it } from 'vitest';
import type { GrowthPlan } from '~/types/growthPlan';
import type { StudentData } from '~/types/plannerData';
import { filterAndSortPlans } from './studentList';

const block = (): GrowthPlan['target'] => ({
  level: 1,
  star: 3,
  uw: 0,
  uwLevel: 1,
  ex: 1,
  normal: 1,
  passive: 1,
  sub: 1,
  affection: 1,
  equipment: [0, 0, 0],
  gear: 0,
  potential: { hp: 0, atk: 0, heal: 0 },
});
const plan = (uuid: string, studentId: number, recruited?: boolean): GrowthPlan => ({
  uuid,
  studentId,
  current: { ...block(), eleph: 0, affectionExp: 0 },
  target: block(),
  includedInEvents: [],
  useEligmaForStar: false,
  eligmaInfo: { price: 1, stock: 0 },
  isSelected: true,
  recruited,
});

describe('filterAndSortPlans unrecruitedOnly', () => {
  const base = {
    searchTerm: '',
    sortOrder: 'date' as const,
    sortReversed: false,
    allStudents: {} as StudentData,
    showOnlySelected: false,
    goalsOnly: false,
    activeAdvancedFilterCount: 0,
    matchesAdvancedFilters: () => true,
    hasProgressFilters: false,
    matchesProgressFilters: () => true,
    matcher: () => true,
  };
  const growthPlans = [plan('a', 1), plan('b', 2, false), plan('c', 3, true)];

  it('keeps every plan by default', () => {
    expect(filterAndSortPlans({ ...base, growthPlans, unrecruitedOnly: false }).map((p) => p.uuid)).toEqual(['a', 'b', 'c']);
  });

  it('keeps only unrecruited plans', () => {
    expect(filterAndSortPlans({ ...base, growthPlans, unrecruitedOnly: true }).map((p) => p.uuid)).toEqual(['b']);
  });
});
