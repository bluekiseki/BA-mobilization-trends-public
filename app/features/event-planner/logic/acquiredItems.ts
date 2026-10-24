import type { TransactionEntry, TransactionItemAmount } from '~/types/plannerData';
import type { FarmingResult } from '~/features/event-planner/components/FarmingPlannerTypes';
import type { BoxGachaResult } from '~/types/minigame/boxGacha';
import type { CardShopRates } from '~/types/minigame/cardShop';
import type { CustomGameResult } from '~/types/minigame/customGame';
import type { DiceRaceResult } from '~/types/minigame/diceRace';
import type { FortuneGachaResult } from '~/types/minigame/fortuneGacha';
import type { TreasureResult } from '~/types/minigame/treasure';
import type { MissionResult } from '~/features/event-planner/types';
import type { ShopResult } from '~/features/event-planner/types';
import type { TotalRewardResult } from '~/features/event-planner/types';
import type { DreamMakerResult } from '~/features/event-planner/minigames/dreamMaker/type';
import type { CardMatchResult } from '~/types/minigame/cardMatch';
import type { MinigameCCGResult } from '../../../types/minigame/ccg';
import type { MinigameDefenseResult } from '../../../types/minigame/defense';
import type { ClueSearchResult } from '~/types/minigame/clueSearch';
import type { FieldEventResult } from '~/types/minigame/fieldEvent';
import type { InteractiveWorldRaidResult } from '../../../types/minigame/interactiveWorldRaid';
import type { RoadPuzzleResult } from '../../../types/minigame/roadPuzzle';
import type { MinigameJankenResult } from '../../../types/minigame/janken';
import type { calculateLocation } from '~/features/event-planner/logic/locationPlanner';

export interface AcquiredItemsInput {
  finalCardFlips: number;
  cardShopRates: CardShopRates | null;
  treasureResult: TreasureResult | null;
  boxGachaResult: BoxGachaResult | null;
  customGameResult: CustomGameResult | null;
  farmingResult: FarmingResult | null;
  fortuneGachaResult: FortuneGachaResult | null;
  shopResult: ShopResult | null;
  totalRewardResult: TotalRewardResult | null;
  missionResult: MissionResult | null;
  diceRaceResult: DiceRaceResult | null;
  dreamMakerResult: DreamMakerResult | null;
  minigameCCGResult: MinigameCCGResult | null;
  cardMatchResult: CardMatchResult | null;
  minigameDefenseResult: MinigameDefenseResult | null;
  studentGrowthNeeds: Record<string, number>;
  clueSearchResult: ClueSearchResult | null;
  fieldEventResult: FieldEventResult | null;
  interactiveWorldRaidResult: InteractiveWorldRaidResult | null;
  roadPuzzleResult: RoadPuzzleResult | null;
  minigameJankenResult: MinigameJankenResult | null;
  locationState: { result: ReturnType<typeof calculateLocation> } | null;
}

export interface AcquiredItemsResult {
  totalItems: Record<string, TransactionItemAmount>;
  transactions: TransactionEntry[];
  totalApUsed: number;
}

/** Aggregates every planner's cost/reward result into per-item totals and an ordered transaction list. */
export function computeAcquiredItems({
  finalCardFlips,
  cardShopRates,
  treasureResult,
  boxGachaResult,
  customGameResult,
  farmingResult,
  fortuneGachaResult,
  shopResult,
  totalRewardResult,
  missionResult,
  diceRaceResult,
  dreamMakerResult,
  minigameCCGResult,
  cardMatchResult,
  minigameDefenseResult,
  studentGrowthNeeds,
  clueSearchResult,
  fieldEventResult,
  interactiveWorldRaidResult,
  roadPuzzleResult,
  minigameJankenResult,
  locationState,
}: AcquiredItemsInput): AcquiredItemsResult {
  const totalItems: Record<string, TransactionItemAmount> = {};
  const transactions: TransactionEntry[] = [];
  let totalApUsed = 0;

  /**
   * Adds one cost (sign -1) or reward (sign +1) map to the running totals and records it as a transaction.
   * Nothing is recorded for an empty map. `normalizeKey` keeps only the first two '_' segments of a key.
   */
  const record = (source: string, amounts: Record<string, number>, sign: 1 | -1, { normalizeKey = false, skipZero = false } = {}) => {
    const items: Record<string, TransactionItemAmount> = {};
    for (const [rawKey, amount] of Object.entries(amounts)) {
      if (skipZero && amount === 0) continue;
      const [keyType, keyId] = rawKey.split('_');
      const key = normalizeKey ? `${keyType}_${keyId}` : rawKey;
      const signed = sign === -1 ? -amount : amount;
      items[key] = { amount: signed, isBonusApplied: false };
      totalItems[key] = { amount: (totalItems[key]?.amount || 0) + signed, isBonusApplied: false };
    }
    if (Object.keys(items).length > 0) transactions.push({ source, items });
  };
  const recordCostAndRewards = (prefix: string, cost: Record<string, number>, rewards: Record<string, number>) => {
    record(`${prefix}_cost`, cost, -1);
    record(`${prefix}_reward`, rewards, 1);
  };
  const single = (cost: { key: string; amount: number }) => ({ [cost.key]: cost.amount });

  if (shopResult) recordCostAndRewards('shop', shopResult.costs, shopResult.rewards);

  // 3. Farming
  if (farmingResult) {
    totalApUsed += farmingResult.totalApUsed;
    if (Object.keys(farmingResult.totalItems).length > 0) {
      transactions.push({
        source: 'farming',
        items: farmingResult.totalItems,
      });

      for (const [key, data] of Object.entries(farmingResult.totalItems)) {
        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + data.amount,
          isBonusApplied: data.isBonusApplied || (totalItems[key]?.isBonusApplied ?? false),
        };
      }
    }
  }

  // 4. Card Shop
  if (cardShopRates && finalCardFlips > 0) {
    const rounds = finalCardFlips / (cardShopRates.avgFlips || 1);
    const perRound = (avg: Record<string, number>) => Object.fromEntries(Object.entries(avg).map(([key, amount]) => [key, amount * rounds]));
    recordCostAndRewards('cardShop', perRound(cardShopRates.avgCosts), perRound(cardShopRates.avgRewards));
  }

  // Single-currency costs and rewards whose keys carry extra '_' segments that must be dropped.
  if (treasureResult) {
    record('treasure_cost', single(treasureResult.cost), -1, { normalizeKey: true });
    record('treasure_reward', treasureResult.rewards, 1, { normalizeKey: true });
  }
  if (boxGachaResult) {
    record('boxGacha_cost', single(boxGachaResult.cost), -1, { normalizeKey: true });
    record('boxGacha_reward', boxGachaResult.rewards, 1, { normalizeKey: true });
  }
  if (customGameResult) {
    if (customGameResult.cost) record('customGame_cost', single(customGameResult.cost), -1, { normalizeKey: true });
    record('customGame_reward', customGameResult.rewards, 1, { normalizeKey: true });
  }

  if (fortuneGachaResult) {
    console.log('fortuneGachaResult', fortuneGachaResult);
    record('fortuneGacha_cost', single(fortuneGachaResult.cost), -1);
    record('fortuneGacha_reward', fortuneGachaResult.rewards, 1);
  }

  if (totalRewardResult) {
    record('totalReward_reward', totalRewardResult.rewards, 1);

    // Cost (Demand) — this is a cumulative collection goal, not a real spend, so it must not
    // be added directly into totalItems here; it's tagged and resolved once at the end
    // (see the goalKind:'cumulative' aggregation pass before the return statement).
    if (totalRewardResult.cost) {
      const { key, amount } = totalRewardResult.cost;
      transactions.push({ source: 'totalReward_cost', items: { [key]: { amount: -amount, isBonusApplied: false, goalKind: 'cumulative' } } });
    }
  }

  if (missionResult) record('mission_reward', missionResult.rewards, 1);
  if (diceRaceResult) recordCostAndRewards('diceRace', diceRaceResult.cost, diceRaceResult.rewards);
  if (dreamMakerResult) recordCostAndRewards('dreamMaker', dreamMakerResult.cost, dreamMakerResult.rewards);
  if (minigameCCGResult) recordCostAndRewards('minigame_ccg', minigameCCGResult.cost, minigameCCGResult.rewards);
  if (cardMatchResult) recordCostAndRewards('cardMatch', cardMatchResult.totalCosts, cardMatchResult.totalRewards);
  if (clueSearchResult) recordCostAndRewards('clueSearch', clueSearchResult.cost, clueSearchResult.rewards);
  if (fieldEventResult) recordCostAndRewards('fieldEvent', fieldEventResult.cost, fieldEventResult.rewards);
  if (roadPuzzleResult) record('roadPuzzle_reward', roadPuzzleResult.rewards, 1);
  if (minigameJankenResult) recordCostAndRewards('minigame_janken', minigameJankenResult.cost, minigameJankenResult.rewards);
  if (interactiveWorldRaidResult) recordCostAndRewards('interactiveWorldRaid', interactiveWorldRaidResult.cost, interactiveWorldRaidResult.rewards);

  record('studentGrowth_cost', studentGrowthNeeds, -1);

  if (minigameDefenseResult) recordCostAndRewards('minigame_defense', minigameDefenseResult.cost, minigameDefenseResult.rewards);

  if (locationState) {
    record('location_cost', locationState.result.cost, -1, { skipZero: true });
    record('location_reward', locationState.result.rewards, 1, { skipZero: true });
  }

  // Item entries tagged goalKind:'cumulative' represent a minimum total-acquisition goal (e.g.
  // Cumulative Rewards), not a real spend — they must not simply stack with real per-unit spend
  // costs that happen to share the same currency. The combined requirement is whichever is
  // larger. This loop is generic and name-agnostic: it reacts to the tag, not to any specific
  // source, so any future source marking an item this way is handled automatically.
  for (const transaction of transactions) {
    for (const [key, data] of Object.entries(transaction.items)) {
      if (data.goalKind !== 'cumulative' || data.amount >= 0) continue;
      const goalNeeded = -data.amount;
      const realNet = totalItems[key]?.amount ?? 0;
      const realDeficit = Math.max(0, -realNet);
      const residual = Math.max(0, goalNeeded - realDeficit);
      if (residual > 0) {
        totalItems[key] = {
          amount: realNet - residual,
          isBonusApplied: totalItems[key]?.isBonusApplied ?? false,
        };
      }
    }
  }

  return { totalItems, transactions, totalApUsed };
}
