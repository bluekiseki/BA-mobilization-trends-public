import { getCharacterStarValue } from '~/utils/raid/report';
import type { Character } from '~/types/raidReport';
import type { Student as PlannerStudent, StudentData } from '~/types/plannerData';
import type { Student } from '~/types/data';
import type { GrowthPlan } from '~/types/growthPlan';
import { getCombatStyleGroupRosterIds, getCombatStylePlanGroupId, isCombatStyleFormOne } from '~/utils/combatStyle';
import { hasGrowthGoal } from '~/features/students/logic/studentFilterFields';

export type StudentSortOrder = 'name' | 'level' | 'date' | 'currentStar' | 'targetStar' | 'id';
type Matcher = (target: string, query: string) => boolean;

export interface FilterAndSortPlansInput {
  growthPlans: GrowthPlan[];
  searchTerm: string;
  sortOrder: StudentSortOrder;
  allStudents: StudentData;
  showOnlySelected: boolean;
  goalsOnly: boolean;
  activeAdvancedFilterCount: number;
  matchesAdvancedFilters: (student: Student | undefined) => boolean;
  hasProgressFilters: boolean;
  matchesProgressFilters: (plan: GrowthPlan) => boolean;
  matcher: Matcher;
}

/** Plans after the selection, goal, advanced, progress and search filters, in the chosen sort order. */
export function filterAndSortPlans({
  growthPlans,
  searchTerm,
  sortOrder,
  allStudents,
  showOnlySelected,
  goalsOnly,
  activeAdvancedFilterCount,
  matchesAdvancedFilters,
  hasProgressFilters,
  matchesProgressFilters,
  matcher,
}: FilterAndSortPlansInput): GrowthPlan[] {
  let result = [...growthPlans];

  // Filter: Show only selected check
  if (showOnlySelected) {
    result = result.filter((p) => p.isSelected);
  }

  if (goalsOnly) {
    result = result.filter((p) => p.studentId !== null && hasGrowthGoal(p));
  }

  if (activeAdvancedFilterCount > 0) {
    result = result.filter((p) => matchesAdvancedFilters(p.studentId ? allStudents[p.studentId] : undefined));
  }

  if (hasProgressFilters) {
    result = result.filter((p) => matchesProgressFilters(p));
  }

  // Filter: Search Term
  if (searchTerm.trim()) {
    const lowerTerm = searchTerm.trim().toLowerCase();
    result = result.filter((p) => {
      const student = p.studentId ? allStudents[p.studentId] : null;
      if (student) return matcher(student.Name, lowerTerm) || matcher(student.PathName, lowerTerm) || student.SearchTags.some((v) => matcher(v, searchTerm));

      return false;
      //  : false;// || matcher(s.FamilyName ?? '', studentSearchQuery);
      // return student ? student.Name.toLowerCase().includes(lowerTerm) : false;
    });
  }

  result.sort((a, b) => {
    const studentA = a.studentId ? allStudents[a.studentId] : null;
    const studentB = b.studentId ? allStudents[b.studentId] : null;

    if (sortOrder === 'name') {
      return (studentA?.Name || '').localeCompare(studentB?.Name || '');
    } else if (sortOrder === 'level') {
      return b.target.level - a.target.level;
    } else if (sortOrder === 'currentStar' || sortOrder === 'targetStar') {
      const rankKey = sortOrder === 'currentStar' ? 'current' : 'target';
      const starA = getCharacterStarValue({
        hasWeapon: a[rankKey].uw > 0,
        star: a[rankKey].star,
        weaponStar: a[rankKey].uw,
      } as Character);
      const starB = getCharacterStarValue({
        hasWeapon: b[rankKey].uw > 0,
        star: b[rankKey].star,
        weaponStar: b[rankKey].uw,
      } as Character);
      return starB - starA;
    } else if (sortOrder === 'id') {
      if (!studentA) return 1;
      if (!studentB) return -1;
      return studentA?.Id - studentB.Id;
    }
    return 0;
  });

  return result;
}

/** Students that have no plan yet (combat-style forms collapsed to one entry), before any filter. */
export function getBaseUnplannedStudents(allStudents: StudentData, growthPlans: GrowthPlan[]): PlannerStudent[] {
  const plannedStudentIds = new Set(
    growthPlans
      .map((plan) => plan.studentId)
      .filter((studentId): studentId is number => studentId !== null)
      .map(getCombatStylePlanGroupId),
  );
  return Object.values(allStudents).filter((student) => !isCombatStyleFormOne(student.Id) && !plannedStudentIds.has(getCombatStylePlanGroupId(student.Id)));
}

export interface ListUnplannedStudentsInput {
  allStudents: StudentData;
  baseUnplannedStudents: PlannerStudent[];
  matcher: Matcher;
  matchesAdvancedFilters: (student: Student | undefined) => boolean;
  searchTerm: string;
  showOnlySelected: boolean;
  goalsOnly: boolean;
  hasProgressFilters: boolean;
}

/** Unplanned students that pass the advanced filters and the search, in in-game default order. */
export function listUnplannedStudents({
  allStudents,
  baseUnplannedStudents,
  matcher,
  matchesAdvancedFilters,
  searchTerm,
  showOnlySelected,
  goalsOnly,
  hasProgressFilters,
}: ListUnplannedStudentsInput): PlannerStudent[] {
  if (showOnlySelected || goalsOnly || hasProgressFilters) return [];
  const lowerTerm = searchTerm.trim().toLowerCase();
  return baseUnplannedStudents
    .filter((student) => matchesAdvancedFilters(student))
    .filter((student) => {
      if (!lowerTerm) return true;
      return getCombatStyleGroupRosterIds(student.Id)
        .map((id) => allStudents[id])
        .filter((style): style is PlannerStudent => style !== undefined)
        .some((style) => matcher(style.Name, lowerTerm) || matcher(style.PathName, lowerTerm) || style.SearchTags.some((tag) => matcher(tag, lowerTerm)));
    })
    .sort((a, b) => {
      // In-game default order first (missing values last), then name
      const orderA = a.DefaultOrder ?? Number.POSITIVE_INFINITY;
      const orderB = b.DefaultOrder ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      return a.Name.localeCompare(b.Name);
    });
}
