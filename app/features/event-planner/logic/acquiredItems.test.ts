import { describe, expect, it, vi } from 'vitest';
import { computeAcquiredItems, type AcquiredItemsInput } from './acquiredItems';

// Pins the aggregation output so that sharing the cost/reward bookkeeping between sections cannot change it.
// Result objects are reduced to the fields computeAcquiredItems reads.
const stub = (value: unknown): never => value as never;

const emptyInput: AcquiredItemsInput = {
  finalCardFlips: 0,
  cardShopRates: null,
  treasureResult: null,
  boxGachaResult: null,
  customGameResult: null,
  farmingResult: null,
  fortuneGachaResult: null,
  shopResult: null,
  totalRewardResult: null,
  missionResult: null,
  diceRaceResult: null,
  dreamMakerResult: null,
  minigameCCGResult: null,
  cardMatchResult: null,
  minigameDefenseResult: null,
  studentGrowthNeeds: {},
  clueSearchResult: null,
  fieldEventResult: null,
  interactiveWorldRaidResult: null,
  roadPuzzleResult: null,
  minigameJankenResult: null,
  locationState: null,
};

const costRewards = { cost: { Currency_1: 10, Item_5: 3 }, rewards: { Item_7: 4, Currency_1: 2 } };
const keyedCost = { cost: { key: 'Item_9_extra', amount: 5 }, rewards: { Item_7_x: 4, Item_8: 1 } };

const fullInput: AcquiredItemsInput = {
  ...emptyInput,
  shopResult: stub({ costs: { Currency_1: 100, Item_2: 4 }, rewards: { Item_3: 8 } }),
  farmingResult: stub({ totalApUsed: 120, totalItems: { Item_3: { amount: 5, isBonusApplied: true }, Item_9: { amount: 2, isBonusApplied: false } } }),
  cardShopRates: stub({ avgFlips: 4, avgCosts: { Currency_1: 3 }, avgRewards: { Item_4: 1.5 } }),
  finalCardFlips: 10,
  treasureResult: stub(keyedCost),
  boxGachaResult: stub(keyedCost),
  customGameResult: stub(keyedCost),
  fortuneGachaResult: stub({ cost: { key: 'Currency_2', amount: 6 }, rewards: { Item_1: 2 } }),
  totalRewardResult: stub({ rewards: { Item_5: 1 }, cost: { key: 'Currency_1', amount: 500 } }),
  missionResult: stub({ rewards: { Currency_1: 50 } }),
  diceRaceResult: stub(costRewards),
  dreamMakerResult: stub(costRewards),
  minigameCCGResult: stub(costRewards),
  cardMatchResult: stub({ totalCosts: { Item_5: 2 }, totalRewards: { Item_6: 3 } }),
  clueSearchResult: stub(costRewards),
  fieldEventResult: stub(costRewards),
  roadPuzzleResult: stub({ rewards: { Item_6: 7 } }),
  minigameJankenResult: stub(costRewards),
  interactiveWorldRaidResult: stub(costRewards),
  studentGrowthNeeds: { Item_5: 9, Item_2: 1 },
  minigameDefenseResult: stub(costRewards),
  locationState: stub({ result: { cost: { Currency_1: 4, Item_5: 0 }, rewards: { Item_6: 2, Item_8: 0 } } }),
};

describe('computeAcquiredItems', () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);

  it('returns empty aggregates when nothing is planned', () => {
    expect(computeAcquiredItems(emptyInput)).toEqual({ totalItems: {}, transactions: [], totalApUsed: 0 });
  });

  it('aggregates every section', () => {
    expect(computeAcquiredItems(fullInput)).toMatchSnapshot();
  });

  it('omits transactions for empty cost/reward maps and skips zero location amounts', () => {
    const input: AcquiredItemsInput = {
      ...emptyInput,
      diceRaceResult: stub({ cost: {}, rewards: { Item_1: 1 } }),
      locationState: stub({ result: { cost: { Item_5: 0 }, rewards: {} } }),
      customGameResult: stub({ cost: null, rewards: {} }),
    };
    expect(computeAcquiredItems(input)).toMatchSnapshot();
  });

  it('resolves a cumulative goal against real net spend', () => {
    const input: AcquiredItemsInput = {
      ...emptyInput,
      diceRaceResult: stub({ cost: { Currency_1: 30 }, rewards: {} }),
      totalRewardResult: stub({ rewards: {}, cost: { key: 'Currency_1', amount: 100 } }),
    };
    expect(computeAcquiredItems(input).totalItems.Currency_1?.amount).toBe(-100);
  });
});
