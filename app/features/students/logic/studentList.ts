import { getCharacterStarValue } from '~/utils/raid/report';
import type { Character } from '~/types/raidReport';
import type { Student as PlannerStudent, StudentData } from '~/types/plannerData';
import type { Student } from '~/types/data';
import type { GrowthPlan } from '~/types/growthPlan';
import { getCombatStyleGroupRosterIds, getCombatStylePlanGroupId, isCombatStyleFormOne } from '~/utils/combatStyle';
import { hasGrowthGoal } from '~/features/students/logic/studentFilterFields';
import { isUnrecruited } from '~/utils/student/recruitState';

export type StudentSortOrder = 'name' | 'level' | 'currentLevel' | 'affection' | 'acquired' | 'date' | 'currentStar' | 'targetStar' | 'id';
type Matcher = (target: string, query: string) => boolean;

export interface FilterAndSortPlansInput {
  growthPlans: GrowthPlan[];
  searchTerm: string;
  sortOrder: StudentSortOrder;
  /** Reverses the natural order of `sortOrder`. */
  sortReversed: boolean;
  allStudents: StudentData;
  showOnlySelected: boolean;
  goalsOnly: boolean;
  unrecruitedOnly: boolean;
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
  sortReversed,
  allStudents,
  showOnlySelected,
  goalsOnly,
  unrecruitedOnly,
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

  if (unrecruitedOnly) {
    result = result.filter((p) => isUnrecruited(p));
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

  const direction = sortReversed ? -1 : 1;
  const originalIndex = new Map(growthPlans.map((plan, index) => [plan.uuid, index]));
  result.sort((a, b) => {
    const studentA = a.studentId ? allStudents[a.studentId] : null;
    const studentB = b.studentId ? allStudents[b.studentId] : null;

    if (sortOrder === 'name') {
      return direction * (studentA?.Name || '').localeCompare(studentB?.Name || '');
    } else if (sortOrder === 'level') {
      return direction * (b.target.level - a.target.level);
    } else if (sortOrder === 'currentLevel') {
      return direction * (b.current.level - a.current.level);
    } else if (sortOrder === 'affection') {
      return direction * (b.current.affection - a.current.affection);
    } else if (sortOrder === 'acquired') {
      // Plans without an acquired date go last in either direction; ties keep registration order
      const dateA = a.acquiredDate || '';
      const dateB = b.acquiredDate || '';
      if (dateA !== dateB) {
        if (!dateA) return 1;
        if (!dateB) return -1;
        return direction * dateA.localeCompare(dateB);
      }
      return direction * ((originalIndex.get(a.uuid) ?? 0) - (originalIndex.get(b.uuid) ?? 0));
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
      return direction * (starB - starA);
    } else if (sortOrder === 'id') {
      if (!studentA) return 1;
      if (!studentB) return -1;
      return direction * (studentA.Id - studentB.Id);
    }
    return direction * ((originalIndex.get(a.uuid) ?? 0) - (originalIndex.get(b.uuid) ?? 0));
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
  sortOrder: StudentSortOrder;
  sortReversed: boolean;
  showOnlySelected: boolean;
  goalsOnly: boolean;
  unrecruitedOnly: boolean;
  hasProgressFilters: boolean;
}

/** Unplanned students that pass the advanced filters and the search, by name or id when sorting by those, otherwise in in-game default order. */
export function listUnplannedStudents({
  allStudents,
  baseUnplannedStudents,
  matcher,
  matchesAdvancedFilters,
  searchTerm,
  sortOrder,
  sortReversed,
  showOnlySelected,
  goalsOnly,
  unrecruitedOnly,
  hasProgressFilters,
}: ListUnplannedStudentsInput): PlannerStudent[] {
  if (showOnlySelected || goalsOnly || unrecruitedOnly || hasProgressFilters) return [];
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
      const direction = sortReversed ? -1 : 1;
      if (sortOrder === 'name') return direction * a.Name.localeCompare(b.Name);
      if (sortOrder === 'id') return direction * (a.Id - b.Id);
      // In-game default order first (missing values last), then name
      const orderA = a.DefaultOrder ?? Number.POSITIVE_INFINITY;
      const orderB = b.DefaultOrder ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return direction * (orderA - orderB);
      return direction * a.Name.localeCompare(b.Name);
    });
}
