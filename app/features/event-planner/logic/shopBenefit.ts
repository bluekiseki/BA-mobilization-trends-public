import type { ItemType } from '~/utils/itemType';

/** Special-request (Commission) areas a shop item can be compared against. */
export const COMMISSION_AREAS = ['slumpia', 'factory'] as const;
export type CommissionArea = (typeof COMMISSION_AREAS)[number];

export const CREDIT_ID = 1;

// Credits dropped by one Slumpia Plaza run, per stage: three drops of these amounts at 10% / 50% / 40%.
const SLUMPIA_DROP_CHANCES = [0.1, 0.5, 0.4];
const SLUMPIA_DROP_AMOUNTS: Record<string, number[]> = {
  A: [3800, 2800, 1550],
  B: [8980, 6500, 3850],
  C: [15400, 11500, 6450],
  D: [23690, 16510, 10720],
  E: [34000, 24000, 13250],
  F: [40000, 30560, 19900],
  G: [46710, 37610, 27550],
  H: [63320, 45000, 34000],
  I: [66040, 48000, 36850],
  J: [73400, 51200, 38050],
  K: [80910, 55200, 42000],
  L: [90030, 60000, 44800],
  M: [97720, 65200, 48000],
  N: [104000, 70000, 52000],
};
// One run drops 5 times and costs 40 AP.
const SLUMPIA_DROPS_PER_RUN = 5;
const SLUMPIA_RUN_AP = 40;

// Ruined Munitions Factory stages: AP cost and the reports one run drops on average (basic, normal, advanced, top tier).
const FACTORY_STAGES: Record<string, { ap: number; reports: [number, number, number, number] }> = {
  A: { ap: 5, reports: [20.5, 0, 0, 0] },
  B: { ap: 10, reports: [23.7, 2, 0, 0] },
  C: { ap: 15, reports: [9.8, 6, 0, 0] },
  D: { ap: 20, reports: [8.5, 9, 0, 0] },
  E: { ap: 25, reports: [10, 12, 0, 0] },
  F: { ap: 30, reports: [0, 8.43, 2, 0] },
  G: { ap: 35, reports: [0, 8.13, 3, 0] },
  H: { ap: 40, reports: [0, 4.11, 5, 0] },
  I: { ap: 40, reports: [0, 5.21, 5, 0] },
  J: { ap: 40, reports: [0, 2.31, 1, 1] },
  K: { ap: 40, reports: [0, 3.41, 1, 1] },
  L: { ap: 40, reports: [0, 4.52, 1, 1] },
  M: { ap: 40, reports: [0, 5.62, 1, 1] },
  N: { ap: 40, reports: [0, 6.7, 1, 1] },
};
const REPORT_EXPS = [50, 500, 2000, 10000];

export interface CommissionStage {
  id: string;
  area: CommissionArea;
  /** Stage level shown after the area name, e.g. "N". */
  level: string;
}

/** Commission stages the shop can be compared against. Add a stage here once its drop data is known. */
export const COMMISSION_STAGES: CommissionStage[] = [
  ...Object.keys(SLUMPIA_DROP_AMOUNTS).map((level) => ({ id: `slumpia-${level}`, area: 'slumpia' as const, level })),
  ...Object.keys(FACTORY_STAGES).map((level) => ({ id: `factory-${level}`, area: 'factory' as const, level })),
];

/** The "×" formula of a Slumpia stage's credit drops in thousands, e.g. "104×0.1 + 70×0.5 + 52×0.4". */
export const slumpiaDropFormula = (level: string) => (SLUMPIA_DROP_AMOUNTS[level] ?? SLUMPIA_DROP_AMOUNTS.N).map((amount, index) => `${amount / 1000}×${SLUMPIA_DROP_CHANCES[index]}`).join(' + ');

// Credits per 1 AP at a Slumpia Plaza stage, times the Commission multiplier.
export const creditsPerAp = (multiplier: number, level = 'N') => {
  const amounts = SLUMPIA_DROP_AMOUNTS[level] ?? SLUMPIA_DROP_AMOUNTS.N;
  const perRun = amounts.reduce((sum, amount, index) => sum + amount * SLUMPIA_DROP_CHANCES[index], 0);
  return ((perRun * SLUMPIA_DROPS_PER_RUN) / SLUMPIA_RUN_AP) * multiplier;
};
// AP value of one top-tier enhancement stone bought with 128000 credits.
export const enhancementStoneApValue = (multiplier: number, level = 'N') => 128000 / creditsPerAp(multiplier, level);
const factoryStage = (level: string) => FACTORY_STAGES[level] ?? FACTORY_STAGES.N;
/** AP one Ruined Munitions Factory run costs. */
export const factoryRunAp = (level: string) => factoryStage(level).ap;
/** The "×" formula of a factory stage's drops in experience, e.g. "10000 × 1 + 2000 × 1 + 500 × 6.7". */
export const factoryDropFormula = (level: string) =>
  factoryStage(level)
    .reports.map((count, index) => (count > 0 ? `${REPORT_EXPS[index]} × ${count}` : ''))
    .filter(Boolean)
    .reverse()
    .join(' + ');
const factoryExpPerRun = (level: string) => factoryStage(level).reports.reduce((sum, count, index) => sum + count * REPORT_EXPS[index], 0);
// AP value of 10000 report experience (one top-tier report): run AP ÷ (experience per run × multiplier ÷ 10000).
export const reportApValue = (multiplier: number, level = 'N') => factoryRunAp(level) / ((factoryExpPerRun(level) * multiplier) / 10000);

// Experience of the report items (basic to top tier); the report value above is per 10000 experience.
const REPORT_EXP: Record<number, number> = { 10: 50, 11: 500, 12: 2000, 13: 10000 };
// Each enhancement stone tier is worth 4 of the tier below it.
export const TOP_STONE_ID = 4;
export const TOP_REPORT_ID = 13;
const STONE_TIER_FACTOR = 4;

export interface ShopRewardInfo {
  itemType: ItemType | null | undefined;
  rewardType: string;
  rewardId: number;
  amount: number;
}

/** AP the reward would cost from the Commission stage, or null when that stage does not drop it. */
export function commissionApValue(stage: CommissionStage, multiplier: number, reward: ShopRewardInfo): number | null {
  if (stage.area === 'slumpia') {
    if (reward.rewardType === 'Currency' && reward.rewardId === CREDIT_ID) return reward.amount / creditsPerAp(multiplier, stage.level);
    if (reward.rewardType === 'Equipment' && reward.rewardId >= 1 && reward.rewardId <= TOP_STONE_ID) {
      return enhancementStoneApValue(multiplier, stage.level) * STONE_TIER_FACTOR ** (reward.rewardId - TOP_STONE_ID) * reward.amount;
    }
    return null;
  }
  const exp = reward.itemType === 'ExpGrowth' ? REPORT_EXP[reward.rewardId] : undefined;
  return exp === undefined ? null : reportApValue(multiplier, stage.level) * (exp / 10000) * reward.amount;
}

/** How many times cheaper the shop is than the Commission: Commission AP ÷ shop AP. Null when the shop price is unknown. */
export function shopBenefitRatio(commissionAp: number, costAmount: number, apPerCurrency: number): number | null {
  const shopAp = costAmount * apPerCurrency;
  if (!(shopAp > 0) || !(commissionAp > 0)) return null;
  return commissionAp / shopAp;
}
