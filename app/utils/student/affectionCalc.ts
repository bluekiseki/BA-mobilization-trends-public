// Pure favor-rank calculation used by AffectionTab: how much EXP the owned gifts give,
// optionally converting spare gifts into the best normal gift (2 -> 1) via crafting.
import { affectionExpToNextLevel } from '~/data/growthData';
import { HighFlowerBouquetItemIds, LowFlowerBouquetItemIds } from './const';
import { isPreferredGift } from './giftAffectionList';

export type GiftRule = 'all' | 'preferred' | 'maxOnly';
export type ConvertMode = 'off' | 'toTarget' | 'all';

export const SELECTION_BOX_ID = 100008;
export const CAFE_TOUCH_EXP = 15;
export const SCHEDULE_EXP = 25;

export const cumulativeAffectionExp: Record<number, number> = {};
let cumulativeExp = 0;
Object.keys(affectionExpToNextLevel)
  .sort((a, b) => Number(a) - Number(b))
  .forEach((levelStr) => {
    const level = Number(levelStr);
    cumulativeExp += affectionExpToNextLevel[level];
    cumulativeAffectionExp[level] = cumulativeExp;
  });

export interface CalcGift {
  id: string;
  rarity: number;
  affectionPoints: number;
}

export interface CalculationResult {
  status: 'success' | 'deficit';
  achievableLevel: number;
  percentage: number;
  deficitExp: number;
  surplusExp: number;
  cafeTouchCount: number;
  scheduleCount: number;
  craftingRequiredCount: number;
}

export interface AffectionCalcInput {
  currentLevel: number;
  currentExp: number;
  targetLevel: number;
  gifts: CalcGift[];
  /** Owned counts by item id; the selection box count lives under SELECTION_BOX_ID. */
  inventory: Record<string, number>;
  giftRule: GiftRule;
  /** Highest points any student gets from each gift id (used by the 'maxOnly' rule). */
  maxPointsById: Record<string, number>;
  convertMode: ConvertMode;
  /** Owned conversion stones. null means unlimited. */
  stoneLimit: number | null;
}

export const isGivenGift = (gift: CalcGift, rule: GiftRule, maxPointsById: Record<string, number>): boolean => {
  if (rule === 'all') return true;
  if (rule === 'preferred') return isPreferredGift(gift);
  const max = maxPointsById[gift.id];
  return max !== undefined && gift.affectionPoints >= max;
};

export const getMaxPointsById = (giftToStudents: Record<string, { affectionPoints: number }[]>): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const [id, students] of Object.entries(giftToStudents)) {
    if (students.length > 0) result[id] = Math.max(...students.map((s) => s.affectionPoints));
  }
  return result;
};

const isBouquet = (id: string) => [...HighFlowerBouquetItemIds, ...LowFlowerBouquetItemIds].includes(Number(id));

export const calculateAffection = (input: AffectionCalcInput): CalculationResult => {
  const { currentLevel, currentExp: curExp, targetLevel, gifts, giftRule, maxPointsById, convertMode, stoneLimit } = input;

  const expForCurrentLevel = affectionExpToNextLevel[currentLevel] || 1;
  let expNeededTotal = currentLevel === targetLevel ? 0 : expForCurrentLevel - curExp;
  for (let i = currentLevel + 1; i < targetLevel; i++) {
    expNeededTotal += affectionExpToNextLevel[i] || 0;
  }

  const bestNormalGift = gifts.filter((g) => g.rarity === 2).reduce((prev, curr) => (curr.affectionPoints > prev.affectionPoints ? curr : prev), { affectionPoints: 0 });
  const targetUnitValue = bestNormalGift.affectionPoints || 60;

  const given = new Map(gifts.map((g) => [g.id, isGivenGift(g, giftRule, maxPointsById)]));
  const inventory = { ...input.inventory };

  let currentExp = (inventory[SELECTION_BOX_ID] || 0) * targetUnitValue;
  gifts.forEach((gift) => {
    if (given.get(gift.id)) currentExp += (inventory[gift.id] || 0) * gift.affectionPoints;
  });

  let craftingCount = 0;

  if (convertMode !== 'off') {
    const stoneCap = stoneLimit ?? Infinity;
    // Given gifts are only worth converting when two of them are worth less than one best normal
    // gift. Gifts excluded by the rule contribute nothing, so any normal (SR) gift among them can
    // be converted, except flower bouquets.
    const fodder = gifts
      .filter((g) => (given.get(g.id) ? g.affectionPoints * 2 < targetUnitValue : g.rarity === 2 && !isBouquet(g.id)))
      .sort((a, b) => Number(given.get(a.id)) * a.affectionPoints - Number(given.get(b.id)) * b.affectionPoints || a.affectionPoints - b.affectionPoints);
    for (const item of fodder) {
      const isGiven = given.get(item.id) === true;
      let count = inventory[item.id] || 0;
      while (count >= 2 && craftingCount < stoneCap && (convertMode === 'all' || currentExp < expNeededTotal)) {
        count -= 2;
        craftingCount++;
        currentExp += isGiven ? targetUnitValue - 2 * item.affectionPoints : targetUnitValue;
      }
    }
  }

  const finalDeficit = Math.max(0, expNeededTotal - currentExp);
  const isSuccess = currentExp >= expNeededTotal;

  const totalExpToCurrentLevelStart = cumulativeAffectionExp[currentLevel - 1] || 0;
  const totalExpToTargetLevelStart = cumulativeAffectionExp[targetLevel - 1] || 0;
  const achievableTotalExp = totalExpToCurrentLevelStart + curExp + currentExp;

  let achievableLevel = 1;
  for (const level of Object.keys(cumulativeAffectionExp).map(Number)) {
    if (achievableTotalExp >= cumulativeAffectionExp[level]) achievableLevel = level + 1;
    else break;
  }
  if (achievableLevel > 100) achievableLevel = 100;

  const totalRange = totalExpToTargetLevelStart - totalExpToCurrentLevelStart;
  let percentage = 0;
  if (totalRange > 0) {
    percentage = Math.min(100, Math.max(0, ((achievableTotalExp - totalExpToCurrentLevelStart) / totalRange) * 100));
  } else if (achievableTotalExp >= totalExpToTargetLevelStart) {
    percentage = 100;
  }

  return {
    status: isSuccess ? 'success' : 'deficit',
    achievableLevel,
    percentage,
    deficitExp: finalDeficit,
    surplusExp: isSuccess ? Math.abs(expNeededTotal - currentExp) : 0,
    cafeTouchCount: Math.ceil(finalDeficit / CAFE_TOUCH_EXP),
    scheduleCount: Math.ceil(finalDeficit / SCHEDULE_EXP),
    craftingRequiredCount: craftingCount,
  };
};
