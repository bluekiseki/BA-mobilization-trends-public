import { getCharacterStarValue } from '~/utils/raid/report';
import type { Character } from '~/types/raidReport';
import type { Student as PlannerStudent } from '~/types/plannerData';
import type { Student } from '~/types/data';
import type { GrowthPlan } from '~/types/growthPlan';
import { findAffectionBucketKey, findLevelBucketKey } from '~/features/students/components/progressFilterBuckets';

const goalStatKeys = ['level', 'star', 'uw', 'uwLevel', 'ex', 'normal', 'passive', 'sub', 'affection', 'gear'] as const;
export function hasGrowthGoal(plan: GrowthPlan): boolean {
  return (
    goalStatKeys.some((key) => plan.current[key] !== plan.target[key]) ||
    plan.current.equipment.some((tier, index) => tier !== plan.target.equipment[index]) ||
    plan.current.potential.hp !== plan.target.potential.hp ||
    plan.current.potential.atk !== plan.target.potential.atk ||
    plan.current.potential.heal !== plan.target.potential.heal
  );
}
export type FilterableStudent = Student & Pick<PlannerStudent, 'ArmorType'>;
export type StaticFilterKey = 'schools' | 'attackTypes' | 'defenseTypes' | 'squadTypes' | 'tacticRoles' | 'recruitTypes';
export type ProgressFilterKey = 'starGrades' | 'levelRanges' | 'affectionRanges';
// Single-field extractors, shared by matchesAdvancedFilters/matchesProgressFilters (which can
// each skip one field via `exceptKey`) and the facet-count computation below (which needs to ask
// "how many would match if only this one field's constraint were lifted").
export const STATIC_FILTER_FIELDS: { key: StaticFilterKey; value: (student: FilterableStudent) => string }[] = [
  { key: 'schools', value: (s) => s.School },
  { key: 'attackTypes', value: (s) => s.BulletType },
  { key: 'defenseTypes', value: (s) => s.ArmorType },
  { key: 'squadTypes', value: (s) => s.SquadType },
  { key: 'tacticRoles', value: (s) => s.TacticRole },
  { key: 'recruitTypes', value: (s) => String(s.IsLimited?.[0] ?? 0) },
];
export const PROGRESS_FILTER_FIELDS: { key: ProgressFilterKey; value: (plan: GrowthPlan) => string | undefined }[] = [
  { key: 'starGrades', value: (plan) => String(getCharacterStarValue({ hasWeapon: plan.current.uw > 0, star: plan.current.star, weaponStar: plan.current.uw } as Character)) },
  { key: 'levelRanges', value: (plan) => findLevelBucketKey(plan.current.level) },
  { key: 'affectionRanges', value: (plan) => findAffectionBucketKey(plan.current.affection) },
];
