import type { GrowthPlan } from '~/types/growthPlan';
import { getStarValue } from '~/utils/raid/report';
import { AFFECTION_BUCKETS, findAffectionBucketKey, findLevelBucketKey, LEVEL_BUCKETS } from '../components/progressFilterBuckets';

export type ProgressSide = 'current' | 'target';
export type ProgressField = 'star' | 'level' | 'affection';
// One filter row per field and side; `param` is the search param holding the chosen option
export const PROGRESS_ROWS = [
  { param: 'cstar', side: 'current', field: 'star' },
  { param: 'tstar', side: 'target', field: 'star' },
  { param: 'clevel', side: 'current', field: 'level' },
  { param: 'tlevel', side: 'target', field: 'level' },
  { param: 'caff', side: 'current', field: 'affection' },
  { param: 'taff', side: 'target', field: 'affection' },
] as const satisfies readonly { param: string; side: ProgressSide; field: ProgressField }[];

// Star values follow getCharacterStarValue: "1".."5" for star grade, "7".."10" for unique weapon stages
export const PROGRESS_OPTIONS: Record<ProgressField, readonly string[]> = {
  star: ['10', '9', '8', '7', '5', '4', '3', '2', '1'],
  level: LEVEL_BUCKETS.map((bucket) => bucket.key),
  affection: AFFECTION_BUCKETS.map((bucket) => bucket.key),
};

/** The option a plan falls into for one field, read from either its current or target state. */
export function progressValue(plan: GrowthPlan, side: ProgressSide, field: ProgressField): string | undefined {
  const state = plan[side];
  switch (field) {
    case 'star':
      return String(getStarValue(state.star, state.uw));
    case 'level':
      return findLevelBucketKey(state.level);
    case 'affection':
      return findAffectionBucketKey(state.affection);
  }
}

/** `chosen` maps a row param to its chosen options (any of them matches); students without a plan never match once any row is chosen. */
export function matchesProgressFilter(plan: GrowthPlan | undefined, chosen: Readonly<Record<string, readonly string[]>>): boolean {
  const rows = PROGRESS_ROWS.filter((row) => chosen[row.param]?.length);
  if (rows.length === 0) return true;
  return plan !== undefined && rows.every((row) => chosen[row.param].includes(progressValue(plan, row.side, row.field) ?? ''));
}
