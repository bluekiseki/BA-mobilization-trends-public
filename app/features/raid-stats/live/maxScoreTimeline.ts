import { getDifficultyFromScoreAndBoss } from '~/utils/difficultyPolicy';
import type { GameServer, RaidInfo } from '~/types/data';
import type { ReportEntry } from '~/types/raidReport';

type ScoreEntry = Pick<ReportEntry, 'r' | 's' | 'h'>;

export const findMaxScoresByDifficulty = (rankEntries: readonly ScoreEntry[], raidInfo: Pick<RaidInfo, 'Id'>, server: GameServer, hideAbnormal: boolean): Record<string, number> => {
  const maxScores: Record<string, number> = {};
  if (!rankEntries || rankEntries.length === 0) return maxScores;

  const sortedByRank = [...rankEntries].sort((a, b) => a.r - b.r);
  const diffOf = (score: number) => getDifficultyFromScoreAndBoss(score, server, raidInfo.Id);

  // Starting at `start` (the first record of a difficulty block), return that difficulty's
  // #1 score. When hiding abnormal records, a cheater-flagged (`h`) top is skipped and the
  // walk continues to the next consecutive rank of the same difficulty; if that run ends
  // before a clean record is found, the difficulty has no trustworthy top (return null).
  const pickTop = (start: number, diff: string): number | null => {
    for (let k = start; k < sortedByRank.length; k++) {
      const e = sortedByRank[k];
      if (k > start) {
        const prev = sortedByRank[k - 1];
        if (e.r - prev.r !== 1 || diffOf(e.s) !== diff) break;
      }
      if (!hideAbnormal || !e.h) return e.s;
    }
    return null;
  };

  // A sparse snapshot cannot establish the overall top without rank 1.
  if (sortedByRank[0].r === 1) {
    const seedDiff = diffOf(sortedByRank[0].s);
    const seedScore = pickTop(0, seedDiff);
    if (seedScore !== null) maxScores[seedDiff] = seedScore;
  }

  for (let i = 1; i < sortedByRank.length; i++) {
    const prev = sortedByRank[i - 1];
    const curr = sortedByRank[i];
    const currDiff = diffOf(curr.s);

    // Boundary: two adjacent ranks straddling a difficulty change -> `curr` is the new
    // difficulty's #1 candidate.
    if (curr.r - prev.r === 1 && currDiff !== diffOf(prev.s) && !maxScores[currDiff]) {
      const score = pickTop(i, currDiff);
      if (score !== null) maxScores[currDiff] = score;
    }
  }
  return maxScores;
};

// Combined scores have no difficulty boundary; require a run beginning at rank 1.
export const findMaxTotalScore = (totalEntries: readonly ScoreEntry[] | undefined, hideAbnormal: boolean): number | null => {
  if (!totalEntries?.length) return null;
  const sortedByRank = [...totalEntries].sort((a, b) => a.r - b.r);
  if (sortedByRank[0].r !== 1) return null;

  for (let i = 0; i < sortedByRank.length; i++) {
    const entry = sortedByRank[i];
    if (i > 0 && entry.r - sortedByRank[i - 1].r !== 1) return null;
    if (!hideAbnormal || !entry.h) return entry.s;
  }
  return null;
};
