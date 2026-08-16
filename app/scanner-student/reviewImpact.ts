import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { StudentReviewRow } from './reviewTypes';

export type ReviewImpactKey =
  'level' | 'star' | 'uw' | 'uwLevel' | 'affection' | 'ex' | 'normal' | 'passive' | 'sub' | 'equipment1' | 'equipment2' | 'equipment3' | 'gear' | 'potentialHp' | 'potentialAtk' | 'potentialHeal';

export interface ReviewImpactItem {
  key: ReviewImpactKey;
  scanned: number | null;
  currentBefore: number;
  currentAfter: number;
  targetBefore: number;
  targetAfter: number;
}

export interface ReviewProjection {
  current: GrowthPlan['current'];
  target: GrowthPlan['target'];
  items: ReviewImpactItem[];
}

const DEFAULT_CURRENT: GrowthPlan['current'] = {
  level: 1,
  star: 1,
  uw: 0,
  uwLevel: 1,
  ex: 1,
  normal: 1,
  passive: 1,
  sub: 1,
  eleph: 0,
  affection: 1,
  affectionExp: 0,
  equipment: [0, 0, 0],
  gear: 0,
  potential: { hp: 0, atk: 0, heal: 0 },
};
const DEFAULT_TARGET: GrowthPlan['target'] = {
  level: 1,
  star: 5,
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
};
const NUMERIC_KEYS = ['level', 'star', 'uw', 'uwLevel', 'ex', 'normal', 'passive', 'sub', 'affection', 'gear'] as const;

export function projectReviewRow(row: StudentReviewRow): ReviewProjection {
  // No existing plan means DEFAULT_CURRENT/DEFAULT_TARGET below are fabricated placeholders,
  // not a real prior state — items must not show a "before → after" diff against them.
  const hasExistingPlan = row.plannerCurrent !== null;
  const beforeCurrent = structuredClone(row.plannerCurrent ?? DEFAULT_CURRENT);
  const beforeTarget = structuredClone(row.plannerTarget ?? DEFAULT_TARGET);
  const current = structuredClone(beforeCurrent);
  const target = structuredClone(beforeTarget);

  for (const key of NUMERIC_KEYS) {
    const value = row.recognized[key];
    if (value !== null) current[key] = value;
  }
  current.equipment = current.equipment.map((value, index) => row.recognized.equipment[index] ?? value) as [number, number, number];
  current.potential = {
    hp: row.recognized.potential.hp ?? current.potential.hp,
    atk: row.recognized.potential.atk ?? current.potential.atk,
    heal: row.recognized.potential.heal ?? current.potential.heal,
  };

  for (const key of NUMERIC_KEYS) target[key] = Math.max(target[key], current[key]);
  const currentRank = current.uw > 0 ? 5 + current.uw : current.star;
  const targetRank = beforeTarget.uw > 0 ? 5 + beforeTarget.uw : beforeTarget.star;
  if (currentRank > targetRank) {
    target.star = current.star;
    target.uw = current.uw;
  }
  target.uwLevel = Math.max(beforeTarget.uwLevel, current.uwLevel);
  target.equipment = target.equipment.map((value, index) => Math.max(value, current.equipment[index])) as [number, number, number];
  target.potential = {
    hp: Math.max(target.potential.hp, current.potential.hp),
    atk: Math.max(target.potential.atk, current.potential.atk),
    heal: Math.max(target.potential.heal, current.potential.heal),
  };

  const item = (key: ReviewImpactKey, scanned: number | null, currentBefore: number, currentAfter: number, targetBefore: number, targetAfter: number): ReviewImpactItem => ({
    key,
    scanned,
    currentBefore: hasExistingPlan ? currentBefore : currentAfter,
    currentAfter,
    targetBefore: hasExistingPlan ? targetBefore : targetAfter,
    targetAfter,
  });
  return {
    current,
    target,
    items: [
      ...(['level', 'star', 'uw', 'uwLevel', 'affection', 'ex', 'normal', 'passive', 'sub'] as const).map((key) =>
        item(key, row.recognized[key], beforeCurrent[key], current[key], beforeTarget[key], target[key]),
      ),
      ...([0, 1, 2] as const).map((index) =>
        item(
          `equipment${index + 1}` as 'equipment1' | 'equipment2' | 'equipment3',
          row.recognized.equipment[index],
          beforeCurrent.equipment[index],
          current.equipment[index],
          beforeTarget.equipment[index],
          target.equipment[index],
        ),
      ),
      item('gear', row.recognized.gear, beforeCurrent.gear, current.gear, beforeTarget.gear, target.gear),
      item('potentialHp', row.recognized.potential.hp, beforeCurrent.potential.hp, current.potential.hp, beforeTarget.potential.hp, target.potential.hp),
      item('potentialAtk', row.recognized.potential.atk, beforeCurrent.potential.atk, current.potential.atk, beforeTarget.potential.atk, target.potential.atk),
      item('potentialHeal', row.recognized.potential.heal, beforeCurrent.potential.heal, current.potential.heal, beforeTarget.potential.heal, target.potential.heal),
    ],
  };
}
