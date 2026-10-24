// Shared by the browser, analysis worker, and offline index builder. No browser imports.
type GameServer = 'jp' | 'kr';

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

export function isNeedOldVersion(server: GameServer, id: string): boolean {
  const isRaid = id.startsWith('R');

  if (server == 'jp') {
    if (isRaid) {
      if (Number(id.substring(1)) <= 47) return true;
    }
  } else {
    if (isRaid) {
      if (Number(id.substring(1)) <= 43) return true;
    }
  }
  return false;
}

export const COMBINATION_ORDER = ['TTT', 'TTI', 'TII', 'III', 'IIE', 'IEE', 'EEE', 'EEH', 'EHH', 'HHH', 'HHV', 'HVV', 'VVV', 'VVA', 'VAA', 'AAA', 'AAN', 'ANN', 'NNN'];
export const DIFFICULTY_ORDER: DifficultyName[] = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];
export const DIFFICULTY_LETTERS = ['L', 'T', 'I', 'E', 'H', 'V', 'A', 'N'];

export function createScoreBrackets(info: { name: DifficultyName; cut: number }[]) {
  const cuts: Record<string, number> = {};
  info.forEach((d, i) => {
    cuts[d.name === 'Hard' ? 'A' : d.name[0]] = i ? info[i - 1].cut : Infinity;
  });
  return COMBINATION_ORDER.map((name) => ({ name, minScore: Array.from(name).reduce((sum, c) => sum + (cuts[c] || 0), 0) })).sort((a, b) => b.minScore - a.minScore);
}
export const SCORE_BRACKET_RULES = createScoreBrackets(difficultyInfo);
export function getBracketFromTotalScore(score: number): string {
  for (let i = 1; i < SCORE_BRACKET_RULES.length; i++) {
    if (score >= SCORE_BRACKET_RULES[i].minScore) return SCORE_BRACKET_RULES[i - 1].name;
  }
  return 'Other';
}
/** Letters follow the season's armor slots; TTI and TIT remain separate. Unknown slots are written as "_". */
export function orderedCombination(profile: (DifficultyName | null)[]): string {
  return profile.map((d) => (d === null ? '_' : DIFFICULTY_LETTERS[DIFFICULTY_ORDER.indexOf(d)])).join('');
}
export function compareCombinations(a: string, b: string): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const difference = DIFFICULTY_LETTERS.indexOf(a[i]) - DIFFICULTY_LETTERS.indexOf(b[i]);
    if (difference) return difference;
  }
  return a.localeCompare(b);
}
