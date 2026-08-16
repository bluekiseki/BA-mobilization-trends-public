import type { DifficultyName } from '~/components/raid/Difficulty';
import type { RaidDetailConfig, RaidTrophy } from '~/types/resourcePlan';

export { RAID_DIFFICULTIES, RAID_TROPHIES } from '~/types/resourcePlan';
export type { DifficultyName };
export type { RaidDetailConfig, RaidTrophy };

export const DEFAULT_RAID_CONFIG: RaidDetailConfig = {
  killDifficulty: 'Insane',
  trophy: 'gold',
  m360: false,
  m400: false,
};

// [normalCoin, premiumCoin] per kill × 21 kills
export const DIFFICULTY_COINS: Record<DifficultyName, [number, number]> = {
  Normal: [10, 0],
  Hard: [20, 0],
  Veryhard: [30, 0],
  Hardcore: [40, 10],
  Extreme: [50, 10],
  Insane: [60, 20],
  Torment: [70, 40],
  Lunatic: [80, 60],
};

// [normalCoin, premiumCoin] trophy reward
export const TROPHY_COINS: Record<RaidTrophy, [number, number]> = {
  platinum: [575, 300],
  gold: [500, 250],
  silver: [425, 200],
  bronze: [325, 150],
};

export const ELIGMA_PER_PERIOD = 135;

export function calcRaidCoins(config: RaidDetailConfig, isRaid: boolean): { normalCoin: number; premiumCoin: number; eligma: number } {
  const [kn, kp] = DIFFICULTY_COINS[config.killDifficulty];
  const [tn, tp] = TROPHY_COINS[config.trophy];
  let normalCoin = kn * 21 + tn;
  const premiumCoin = kp * 21 + tp;
  if (isRaid) {
    if (config.m360) normalCoin += 300;
    if (config.m400) normalCoin += 200;
  }
  return { normalCoin, premiumCoin, eligma: ELIGMA_PER_PERIOD };
}

// Moved from useTacticalPlanStore — used by PvpCoinSection and ElephPlanner
export function rankToDailyCoins(rank: number): number {
  if (rank <= 1) return 125;
  if (rank <= 2) return 120;
  if (rank <= 10) return 110;
  if (rank <= 100) return 100;
  if (rank <= 200) return 80;
  if (rank <= 500) return 70;
  if (rank <= 1000) return 70;
  if (rank <= 2000) return 60;
  if (rank <= 4000) return 50;
  if (rank <= 8000) return 40;
  return 30;
}

// 1st refill: 45 coins, 2nd+: 55 coins each
export function dailyRefillCost(refillsPerDay: number): number {
  if (refillsPerDay <= 0) return 0;
  return 45 + Math.max(0, refillsPerDay - 1) * 55;
}
