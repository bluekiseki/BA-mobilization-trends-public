import type { DifficultyName } from '~/utils/difficultyPolicy';

export interface DifficultyGroupTicks {
  groupStartNames: Set<string>;
  dividerNames: string[];
  tickNames: string[];
  distinctDifficulties: DifficultyName[];
}

/**
 * Ticks/dividers for a bar chart whose categories are ordered in contiguous runs by difficulty
 * tier. Always ticks each tier's first bar (so a label is never read without knowing which tier
 * it belongs to) while keeping overall density near `targetTickCount` - and drops any step-based
 * tick that would land too close to a forced tier-start tick, so their labels can't collide.
 */
export function computeDifficultyGroupTicks<T>(items: T[], getDifficulty: (item: T) => DifficultyName, getName: (item: T) => string, targetTickCount: number): DifficultyGroupTicks {
  const groupStartNames = new Set<string>();
  const dividerNames: string[] = [];
  const distinctDifficulties: DifficultyName[] = [];
  const forcedIndices: number[] = [];

  let i = 0;
  while (i < items.length) {
    const groupDifficulty = getDifficulty(items[i]);
    groupStartNames.add(getName(items[i]));
    distinctDifficulties.push(groupDifficulty);
    forcedIndices.push(i);
    if (i > 0) dividerNames.push(getName(items[i]));

    let end = i;
    while (end + 1 < items.length && getDifficulty(items[end + 1]) === groupDifficulty) end++;
    i = end + 1;
  }

  if (items.length === 0) {
    return { groupStartNames, dividerNames, tickNames: [], distinctDifficulties };
  }

  const step = Math.max(1, Math.round(items.length / Math.max(1, targetTickCount)));
  const minGap = Math.max(1, Math.floor(step / 2));
  const forcedSet = new Set(forcedIndices);

  const candidates = new Set<number>(forcedIndices);
  for (let idx = 0; idx < items.length; idx += step) candidates.add(idx);

  const tickIndices = Array.from(candidates)
    .sort((a, b) => a - b)
    .filter((idx) => forcedSet.has(idx) || forcedIndices.every((f) => Math.abs(f - idx) >= minGap));

  const tickNames = tickIndices.map((idx) => getName(items[idx]));

  return { groupStartNames, dividerNames, tickNames, distinctDifficulties };
}
