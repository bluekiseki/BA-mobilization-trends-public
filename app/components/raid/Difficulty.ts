import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import { createScoreBrackets, difficultyInfo, getDifficultyFromScore, type DifficultyName } from '../../utils/difficultyPolicy';
export { difficultyInfo, getDifficultyFromScore, getDifficultyFromScoreAndBoss, getDifficultyInfoFromScoreAndBoss, getBracketFromTotalScore } from '../../utils/difficultyPolicy';
export type { DifficultyName } from '../../utils/difficultyPolicy';

export const generateScoreBrackets = (info: { name: DifficultyName; cut: number }[]) =>
  createScoreBrackets(info).map((bracket) => ({ ...bracket, fill: DIFFICULTY_COLORS[getDifficultyFromScore(bracket.minScore / 3)] }));
export const SCORE_BRACKETS = generateScoreBrackets(difficultyInfo);
export const getBracketColorFromTotalScore = (score: number) => {
  for (let i = 1; i < SCORE_BRACKETS.length; i++) {
    if (score >= SCORE_BRACKETS[i].minScore) return SCORE_BRACKETS[i - 1].fill;
  }
  return '#ccc';
};
