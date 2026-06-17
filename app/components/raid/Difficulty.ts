import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import type { GameServer } from '~/types/data';
import { isNeedOldVersion } from '~/utils/calculateTimeFromScore';

export type DifficultyName = 'Lunatic' | 'Torment' | 'Insane' | 'Extreme' | 'Hardcore' | 'Veryhard' | 'Hard' | 'Normal';
export type DifficultySelect = 'All' | DifficultyName;
export const difficultyInfo: { name: DifficultyName; cut: number }[] = [
  { name: 'Lunatic', cut: 41000000 },
  { name: 'Torment', cut: 28000000 },
  { name: 'Insane', cut: 15500000 },
  { name: 'Extreme', cut: 7672000 },
  { name: 'Hardcore', cut: 3836000 },
  { name: 'Veryhard', cut: 1918000 },
  { name: 'Hard', cut: 959000 },
  { name: 'Normal', cut: 0 },
];

const difficultyNewInfo: { name: DifficultyName; cut: number }[] = [
  { name: 'Lunatic', cut: 42000000 },
  { name: 'Torment', cut: 29000000 },
  { name: 'Insane', cut: 15760000 }, // 15500000
  { name: 'Extreme', cut: 7893600 }, // 7672000
  { name: 'Hardcore', cut: 3946800 }, // 3836000
  { name: 'Veryhard', cut: 1973400 }, // 1918000
  { name: 'Hard', cut: 986700 }, // 959000
  { name: 'Normal', cut: 0 },
];

export function getDifficultyFromScore(score: number): DifficultyName {
  for (const diff of difficultyInfo) {
    if (score >= diff.cut) {
      return diff.name;
    }
  }

  return 'Normal';
}

export function getDifficultyFromScoreAndBoss(score: number, server: GameServer, id: string): DifficultyName {
  const needOldVersion = isNeedOldVersion(server, id);

  for (const diff of needOldVersion ? difficultyInfo : difficultyNewInfo) {
    if (score >= diff.cut) {
      return diff.name;
    }
  }

  return 'Normal';
}

export function getDifficultyInfoFromScoreAndBoss(server: GameServer, id: string) {
  const needOldVersion = isNeedOldVersion(server, id);

  return needOldVersion ? difficultyInfo : difficultyNewInfo;
}

export const generateScoreBrackets = (info: typeof difficultyNewInfo) => {
  // Create a map with the first letter of difficulty as the key and the cut score as the value (e.g. { T: 28000000, I: 15500000, ... })
  const cutMap: Record<string, number> = {};
  info.forEach((d, i) => {
    if (i) {
      cutMap[d.name == 'Hard' ? 'A' : d.name[0]] = info[i - 1].cut;
    } else {
      cutMap[d.name[0]] = Infinity;
    }
  });

  // List of difficulty combinations to analyze
  const combinations = ['TTT', 'TTI', 'TII', 'III', 'IIE', 'IEE', 'EEE', 'EEH', 'EHH', 'HHH', 'HHV', 'HVV', 'VVV', 'VVA', 'VAA', 'AAA', 'AAN', 'ANN', 'NNN'];

  const brackets = combinations.map((combo) => {
    // Summing the cut scores corresponding to each letter of the combination
    const minScore = combo.split('').reduce((sum, char) => sum + (cutMap[char] || 0), 0);
    return {
      name: combo,
      minScore,
      fill: DIFFICULTY_COLORS[getDifficultyFromScore(minScore / 3)],
    };
  });

  //  Sort the function in order of the highest score so that getBracketFromTotalScore works correctly
  return brackets.sort((a, b) => b.minScore - a.minScore);
};

// 2. Create SCORE_BRACKETS dynamically by invoking the above function
export const SCORE_BRACKETS = generateScoreBrackets(difficultyInfo);

export const getBracketFromTotalScore = (score: number) => {
  for (let i = 1; i < SCORE_BRACKETS.length; i++) {
    if (score >= SCORE_BRACKETS[i].minScore) return SCORE_BRACKETS[i - 1].name;
  }

  return 'Other';
};

export const getBracketColorFromTotalScore = (score: number) => {
  for (let i = 1; i < SCORE_BRACKETS.length; i++) {
    if (score >= SCORE_BRACKETS[i].minScore) {
      return SCORE_BRACKETS[i - 1].fill;
    }
  }
  return '#ccc';
};
