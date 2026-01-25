import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventData, IconData, StudentData, StudentPortraitData, TransactionEntry } from '~/types/plannerData';
import { ApCalculator } from '~/components/planner/ApCalculator';
import { BonusSelector, type TotalBonusMap } from '~/components/planner/BonusSelector';
import { FloatingCurrencyStatus } from '~/components/planner/FloatingCurrencyStatus';
import ExportImportPanel from '~/components/planner/ExportImportPanel';
import { FarmingPlanner, type FarmingResult } from '~/components/planner/FarmingPlanner';
import { BoxGachaPlanner, type BoxGachaResult } from '~/components/planner/minigame/BoxGachaPlanner';
import { CardShopPlanner, type CardShopRates } from '~/components/planner/minigame/CardShopPlanner';
import { CustomGamePlanner, type CustomGameResult } from '~/components/planner/minigame/CustomGamePlanner';
import { DiceRacePlanner, type DiceRaceResult } from '~/components/planner/minigame/DiceRacePlanner';
import { FortuneGachaPlanner, type FortuneGachaResult } from '~/components/planner/minigame/FortuneGachaPlanner';
import { TreasurePlanner, type TreasureResult } from '~/components/planner/minigame/TreasurePlanner';
import { MissionPlanner, type MissionResult } from '~/components/planner/MissionPlanner';
import { ShopPlanner, type ShopResult } from '~/components/planner/ShopPlanner';
import { StudentGrowthPlanner } from '~/components/planner/StudentGrowth/StudentGrowthPlanner';
import { TotalBonusDisplay } from '~/components/planner/TotalBonusDisplay';
import { TotalRewardPlanner, type TotalRewardResult } from '~/components/planner/TotalRewardPlanner';
import { DreamMakerPlanner } from '~/components/planner/minigame/MinigameDreamPlanner';
import type { DreamMakerResult } from '~/components/planner/minigame/dreamMaker/type';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { CardMatchPlanner, type CardMatchResult } from '~/components/planner/minigame/CardMatchPlanner';
import { MinigameCCGPlanner, type MinigameCCGResult } from '../minigame/MinigameCCGPlanner';
import { MinigameDefensePlanner, type MinigameDefenseResult } from '../minigame/MinigameDefensePlanner';

// --- Type definitions ---
type MainTabId = 'bonus' | 'goals' | 'minigame' | 'farming' | 'ap';
type SubTabId =
  | 'shop'
  | 'growth'
  | 'mission'
  | 'stages'
  | 'custom'
  | 'box'
  | 'card'
  | 'treasure'
  | 'fortune'
  | 'total_reward'
  | 'dice_race'
  | 'minigame_dream'
  | 'minigame_ccg'
  | 'card_match'
  | 'minigame_defence';

// Desktop: Adjust left/right padding since there is a right sidebar
const mainContentClasses = 'flex-1 min-w-0 px-4 sm:px-6 pb-32 pt-6 space-y-8 w-full';

// Increase management efficiency by integrating all stage info and assigning types beforehand
const getAllStages = (eventData: EventData) => {
  if (!eventData.stage) return [];
  return [
    ...(eventData.stage.stage || []).map((s) => ({
      ...s,
      type: 'stage' as const,
    })),
    ...(eventData.stage.story || []).map((s) => ({
      ...s,
      type: 'story' as const,
    })),
    ...(eventData.stage.challenge || []).map((s) => ({
      ...s,
      type: 'challenge' as const,
    })),
  ];
};

export interface EventPlannerProp {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  allStudents: StudentData;
  studentPortraits: StudentPortraitData;
}

export const EventPlanner = ({ eventId, eventData, iconData, allStudents, studentPortraits }: EventPlannerProp) => {
  const { t } = useTranslation('planner');
  const tabNavRef = useRef<HTMLDivElement | null>(null);

  // Farming plan related state
  const [availableAp, setAvailableAp] = useState(0);
  const [farmingResult, setFarmingResult] = useState<FarmingResult | null>(null);

  // Shop plan related state (Moved to EventPage for central management)
  const [shopResult, setShopResult] = useState<ShopResult | null>(null);

  // Card shop flip count state
  const [cardShopRates, setCardShopRates] = useState<CardShopRates | null>(null);
  const [finalCardFlips, setFinalCardFlips] = useState(0);

  // State to store currently owned materials
  const [ownedCurrency, setOwnedCurrency] = useState<Record<number, number>>({});

  // State to store treasure hunt results
  const [treasureResult, setTreasureResult] = useState<TreasureResult | null>(null);

  // state to store FortuneGachaPlanner results
  const [fortuneGachaResult, setFortuneGachaResult] = useState<FortuneGachaResult | null>(null);

  const [diceRaceResult, setDiceRaceResult] = useState<DiceRaceResult | null>(null);

  const [cardMatchResult, setCardMatchResult] = useState<CardMatchResult | null>(null);

  const [boxGachaResult, setBoxGachaResult] = useState<BoxGachaResult | null>(null);
  const [customGameResult, setCustomGameResult] = useState<CustomGameResult | null>(null);
  const [dreamMakerResult, setDreamMakerResult] = useState<DreamMakerResult | null>(null);
  const [minigameCCGResult, setMinigameCCGResult] = useState<MinigameCCGResult | null>(null);
  const [minigameDefenseResult, setMinigameDefenseResult] = useState<MinigameDefenseResult | null>(null);

  const [totalRewardResult, setTotalRewardResult] = useState<TotalRewardResult | null>(null);
  const [totalBonus, setTotalBonus] = useState<TotalBonusMap>({});

  // State to receive results from MissionPlanner
  const [missionResult, setMissionResult] = useState<MissionResult | null>(null);

  const [studentGrowthNeeds, setStudentGrowthNeeds] = useState<Record<string, number>>({}); // Student growth requirement state
  // tab

  // Misc
  const { purchaseCounts } = usePlanForEvent(eventId);

  const TABS: {
    id: MainTabId;
    name: string;
    subTabs?: { id: SubTabId; name: string }[];
  }[] = useMemo(() => {
    if (!eventData) return []; // Don&#39;t display tabs before data is loaded

    const allTabs: {
      id: MainTabId;
      name: string;
      subTabs?: { id: SubTabId; name: string }[];
    }[] = [];

    if (eventData.bonus) {
      allTabs.push({ id: 'bonus', name: `1. ${t('ui.studentBonus')}` });
    }

    allTabs.push({
      id: 'goals',
      name: `2. ${t('ui.targetSettings')}`,
      subTabs: [
        { id: 'shop', name: t('common.shop') },
        { id: 'growth', name: t('page.studentGrowth') },
        { id: 'mission', name: t('page.missionList') },
      ],
    });

    if (eventData.total_reward) {
      allTabs[allTabs.length - 1].subTabs?.push({
        id: 'total_reward',
        name: t('label.cumulativeRewards'),
      });
    }

    // --- Create sub-tabs by filtering only existing minigames ---
    const minigameSubTabs: { id: SubTabId; name: string }[] = [];
    if (eventData.box_gacha) {
      minigameSubTabs.push({ id: 'box', name: t('minigame.roulette') });
    }
    if (eventData.season.EventContentTypeStr.includes('Treasure')) {
      minigameSubTabs.push({
        id: 'treasure',
        name: t('minigame.treasureHunt'),
      });
    }
    if (eventData.season.EventContentTypeStr.includes('CardShop')) {
      minigameSubTabs.push({ id: 'card', name: t('placeholder.cardGacha') });
    }
    if (eventData.season.EventContentTypeStr.includes('FortuneGachaShop')) {
      minigameSubTabs.push({ id: 'fortune', name: t('minigame.omikuji') });
    }
    if (eventData.dice_race) {
      minigameSubTabs.push({ id: 'dice_race', name: t('minigame.diceRace') });
    }
    if (eventData.minigame_dream) {
      minigameSubTabs.push({
        id: 'minigame_dream',
        name: t('minigame.minigame_dream'),
      });
    }
    if (eventData.minigame_ccg) {
      minigameSubTabs.push({
        id: 'minigame_ccg',
        name: t('minigame.minigame_ccg'),
      });
    }
    if (eventData.concentration) {
      minigameSubTabs.push({
        id: 'card_match',
        name: t('minigame.card_match'),
      });
    }
    if (eventData.minigame_defense) {
      minigameSubTabs.push({
        id: 'minigame_defence',
        name: t('minigame.minigame_defense'),
      });
    }
    minigameSubTabs.push({
      id: 'custom',
      name: t('placeholder.customExchange'),
    });

    if (minigameSubTabs.length > 0) {
      allTabs.push({
        id: 'minigame',
        name: `3. ${t('ui.minigame')}`,
        subTabs: minigameSubTabs,
      });
    }

    allTabs.push({ id: 'ap', name: `4. ${t('ui.apSupply')}` });

    if (eventData?.stage?.stage) {
      allTabs.push({
        id: 'farming',
        name: `5. ${t('ui.farmingRun')}`,
        subTabs: [{ id: 'stages', name: t('ui.stageFarming') }],
      });
    }

    return allTabs;
  }, [eventData]);

  const [activeMainTab, setActiveMainTab] = useState<MainTabId>(
    // 'bonus'
    TABS[0].id,
  );
  // const [activeSubTab, setActiveSubTab] = useState<SubTabId | null>(null);
  const [activeSubTabs, setActiveSubTabs] = useState<Partial<Record<MainTabId, SubTabId | null>>>({
    goals: 'shop',
    minigame: null,
    farming: 'stages',
  });

  const mainTabFind = TABS.filter((v) => v.id == activeMainTab)[0];
  const activeSubTab = activeSubTabs[activeMainTab] || mainTabFind?.subTabs?.[0]?.id;

  const currentTabIndex = TABS.findIndex((tab) => tab.id === activeMainTab);
  const isLastTab = currentTabIndex === -1 || currentTabIndex === TABS.length - 1;
  let nextTab: { id: MainTabId; name: string } | null = null;
  let nextTabName = '';

  if (!isLastTab) {
    nextTab = TABS[currentTabIndex + 1];
    nextTabName = nextTab.name.replace(/^\d+\.\s*/, ''); // Remove numeric prefixes like "1. ", "2. "
  }

  const allStages = useMemo(() => (eventData ? getAllStages(eventData) : []), [eventData]);

  useEffect(() => {
    const costs: Record<string, number> = {};
    const rewards: Record<string, number> = {};

    if (!eventData || !purchaseCounts) return;
    const onCalculate = setShopResult;

    purchaseCounts &&
      Object.entries(purchaseCounts).forEach(([itemIdStr, count]) => {
        if (count <= 0) return;
        const itemId = Number(itemIdStr);
        const allItems = Object.values(eventData.shop).flat();
        const itemInfo = allItems.find((i) => i.Id === itemId);

        if (itemInfo && itemInfo.Goods && itemInfo.Goods.length > 0) {
          const goods = itemInfo.Goods[0];
          // Calculate cost
          const costKey = `${goods.ConsumeParcelTypeStr[0]}_${goods.ConsumeParcelId[0]}`;
          costs[costKey] = (costs[costKey] || 0) + goods.ConsumeParcelAmount[0] * count;

          // Calculate reward
          const rewardKey = `${goods.ParcelTypeStr[0]}_${goods.ParcelId[0]}`;
          rewards[rewardKey] = (rewards[rewardKey] || 0) + goods.ParcelAmount[0] * count;
        }
      });

    onCalculate({ costs, rewards });
  }, [purchaseCounts, eventData, setShopResult]);

  const acquiredItemsResult = useMemo(() => {
    const totalItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
    const transactions: TransactionEntry[] = [];
    let totalApUsed = 0;

    if (!eventData) return { totalItems, transactions, totalApUsed }; // <-- transactions add

    if (shopResult) {
      // Cost
      if (Object.keys(shopResult.costs).length > 0) {
        const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
        for (const [key, amount] of Object.entries(shopResult.costs)) {
          const itemData = { amount: -amount, isBonusApplied: false };
          costItems[key] = itemData;
          totalItems[key] = {
            amount: (totalItems[key]?.amount || 0) + itemData.amount,
            isBonusApplied: false,
          };
        }
        transactions.push({ source: 'shop_cost', items: costItems });
      }

      // Reward
      if (Object.keys(shopResult.rewards).length > 0) {
        const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
        for (const [key, amount] of Object.entries(shopResult.rewards)) {
          const itemData = { amount: amount, isBonusApplied: false };
          rewardItems[key] = itemData;
          totalItems[key] = {
            amount: (totalItems[key]?.amount || 0) + itemData.amount,
            isBonusApplied: false,
          };
        }
        transactions.push({ source: 'shop_reward', items: rewardItems });
      }
    }

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
            isBonusApplied: totalItems[key]?.isBonusApplied || false || data.isBonusApplied,
          };
        }
      }
    }

    // 4. Card Shop
    if (cardShopRates && finalCardFlips > 0) {
      const rounds = finalCardFlips / (cardShopRates.avgFlips || 1);

      // Cost
      const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      Object.entries(cardShopRates.avgCosts).forEach(([key, avgAmount]) => {
        const compositeKey = `${key}`;
        const amount = -(avgAmount * rounds);
        costItems[compositeKey] = { amount, isBonusApplied: false };

        totalItems[compositeKey] = {
          amount: (totalItems[compositeKey]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      });
      if (Object.keys(costItems).length > 0) {
        transactions.push({ source: 'cardShop_cost', items: costItems });
      }

      // Reward
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      Object.entries(cardShopRates.avgRewards).forEach(([key, avgAmount]) => {
        const compositeKey = `${key}`;
        const amount = avgAmount * rounds;
        rewardItems[compositeKey] = { amount, isBonusApplied: false };

        totalItems[compositeKey] = {
          amount: (totalItems[compositeKey]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      });
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({ source: 'cardShop_reward', items: rewardItems });
      }
    }

    // 5. Treasure
    if (treasureResult) {
      // Cost
      const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      const [costType, costId] = treasureResult.cost.key.split('_');
      const costKey = `${costType}_${costId}`;
      const costAmount = -treasureResult.cost.amount;
      costItems[costKey] = { amount: costAmount, isBonusApplied: false };

      totalItems[costKey] = {
        amount: (totalItems[costKey]?.amount || 0) + costAmount,
        isBonusApplied: false,
      };
      transactions.push({ source: 'treasure_cost', items: costItems });

      // Reward
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [rewardKey, amount] of Object.entries(treasureResult.rewards)) {
        const [rewardType, rewardId] = rewardKey.split('_');
        const finalKey = `${rewardType}_${rewardId}`;
        rewardItems[finalKey] = { amount, isBonusApplied: false };

        totalItems[finalKey] = {
          amount: (totalItems[finalKey]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({ source: 'treasure_reward', items: rewardItems });
      }
    }

    // 6. Box Gacha
    if (boxGachaResult) {
      // Cost
      const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      const [costType, costId] = boxGachaResult.cost.key.split('_');
      const costKey = `${costType}_${costId}`;
      const costAmount = -boxGachaResult.cost.amount;
      costItems[costKey] = { amount: costAmount, isBonusApplied: false };

      totalItems[costKey] = {
        amount: (totalItems[costKey]?.amount || 0) + costAmount,
        isBonusApplied: false,
      };
      transactions.push({ source: 'boxGacha_cost', items: costItems });

      // Reward
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [rewardKey, amount] of Object.entries(boxGachaResult.rewards)) {
        const [rewardType, rewardId] = rewardKey.split('_');
        const finalKey = `${rewardType}_${rewardId}`;
        rewardItems[finalKey] = { amount, isBonusApplied: false };

        totalItems[finalKey] = {
          amount: (totalItems[finalKey]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({ source: 'boxGacha_reward', items: rewardItems });
      }
    }

    // 7. Custom Game
    if (customGameResult) {
      // Cost
      if (customGameResult.cost) {
        const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
        const [costType, costId] = customGameResult.cost.key.split('_');
        const costKey = `${costType}_${costId}`;
        const costAmount = -customGameResult.cost.amount;
        costItems[costKey] = { amount: costAmount, isBonusApplied: false };

        totalItems[costKey] = {
          amount: (totalItems[costKey]?.amount || 0) + costAmount,
          isBonusApplied: false,
        };
        transactions.push({ source: 'customGame_cost', items: costItems });
      }

      // Reward
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [rewardKey, amount] of Object.entries(customGameResult.rewards)) {
        const [rewardType, rewardId] = rewardKey.split('_');
        const finalKey = `${rewardType}_${rewardId}`;
        rewardItems[finalKey] = { amount, isBonusApplied: false };

        totalItems[finalKey] = {
          amount: (totalItems[finalKey]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({ source: 'customGame_reward', items: rewardItems });
      }
    }

    // 8. Fortune Gacha
    if (fortuneGachaResult) {
      const { cost, rewards } = fortuneGachaResult;

      // Cost
      const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      const costAmount = -cost.amount;
      costItems[cost.key] = { amount: costAmount, isBonusApplied: false };

      totalItems[cost.key] = {
        amount: (totalItems[cost.key]?.amount || 0) + costAmount,
        isBonusApplied: false,
      };
      transactions.push({ source: 'fortuneGacha_cost', items: costItems });

      // Reward
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [rewardKey, amount] of Object.entries(rewards)) {
        rewardItems[rewardKey] = { amount, isBonusApplied: false };

        totalItems[rewardKey] = {
          amount: (totalItems[rewardKey]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({
          source: 'fortuneGacha_reward',
          items: rewardItems,
        });
      }
    }

    // 9. Total Reward
    if (totalRewardResult) {
      // Reward
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(totalRewardResult.rewards)) {
        rewardItems[key] = { amount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({ source: 'totalReward_reward', items: rewardItems });
      }

      // Cost (Demand)
      if (totalRewardResult.cost) {
        const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
        const { key, amount } = totalRewardResult.cost;
        const costAmount = -amount;
        costItems[key] = { amount: costAmount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + costAmount,
          isBonusApplied: false,
        };
        transactions.push({ source: 'totalReward_cost', items: costItems });
      }
    }

    // 10. Mission
    if (missionResult) {
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(missionResult.rewards)) {
        rewardItems[key] = { amount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({ source: 'mission_reward', items: rewardItems });
      }
    }

    // 11. Dice Race
    if (diceRaceResult) {
      // Cost
      const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(diceRaceResult.cost)) {
        const costAmount = -amount;
        costItems[key] = { amount: costAmount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + costAmount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(costItems).length > 0) {
        transactions.push({ source: 'diceRace_cost', items: costItems });
      }

      // Reward
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(diceRaceResult.rewards)) {
        rewardItems[key] = { amount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({ source: 'diceRace_reward', items: rewardItems });
      }
    }

    // 12. Dream Maker
    if (dreamMakerResult) {
      // Cost
      const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(dreamMakerResult.cost)) {
        const costAmount = -amount;
        costItems[key] = { amount: costAmount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + costAmount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(costItems).length > 0) {
        transactions.push({ source: 'dreamMaker_cost', items: costItems });
      }

      // Reward
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(dreamMakerResult.rewards)) {
        rewardItems[key] = { amount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({ source: 'dreamMaker_reward', items: rewardItems });
      }
    }

    // 12. Dream Maker
    if (minigameCCGResult) {
      // Cost
      const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(minigameCCGResult.cost)) {
        const costAmount = -amount;
        costItems[key] = { amount: costAmount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + costAmount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(costItems).length > 0) {
        transactions.push({ source: 'minigame_ccg_cost', items: costItems });
      }

      // Reward
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(minigameCCGResult.rewards)) {
        rewardItems[key] = { amount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({
          source: 'minigame_ccg_reward',
          items: rewardItems,
        });
      }
    }

    // 12. Card Match (Concentration)
    if (cardMatchResult) {
      // Costs (Total cost calculated in Planner, passed as positive value)
      const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      Object.entries(cardMatchResult.totalCosts).forEach(([key, amount]) => {
        // Convert to negative (-) since it is consumption, then save
        const signedAmount = -amount;
        costItems[key] = { amount: signedAmount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + signedAmount,
          isBonusApplied: false,
        };
      });
      if (Object.keys(costItems).length > 0) {
        transactions.push({ source: 'cardMatch_cost', items: costItems });
      }

      // Rewards (Total rewards calculated in Planner)
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      Object.entries(cardMatchResult.totalRewards).forEach(([key, amount]) => {
        rewardItems[key] = { amount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      });
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({ source: 'cardMatch_reward', items: rewardItems });
      }
    }

    // 13. Student Growth Needs
    if (studentGrowthNeeds) {
      const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(studentGrowthNeeds)) {
        const costAmount = -amount;
        costItems[key] = { amount: costAmount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + costAmount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(costItems).length > 0) {
        transactions.push({ source: 'studentGrowth_cost', items: costItems });
      }
    }

    // 12. Dream Maker
    if (minigameDefenseResult) {
      // Cost
      const costItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(minigameDefenseResult.cost)) {
        const costAmount = -amount;
        costItems[key] = { amount: costAmount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + costAmount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(costItems).length > 0) {
        transactions.push({ source: 'minigame_defense_cost', items: costItems });
      }

      // Reward
      const rewardItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
      for (const [key, amount] of Object.entries(minigameDefenseResult.rewards)) {
        rewardItems[key] = { amount, isBonusApplied: false };

        totalItems[key] = {
          amount: (totalItems[key]?.amount || 0) + amount,
          isBonusApplied: false,
        };
      }
      if (Object.keys(rewardItems).length > 0) {
        transactions.push({
          source: 'minigame_defense_reward',
          items: rewardItems,
        });
      }
    }

    return { totalItems, transactions, totalApUsed };
  }, [
    totalBonus,
    eventData,
    allStages,
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
  ]);

  const finalCurrencyBalance = useMemo(() => {
    const balance: Record<string, number> = {};

    // 1. Start with current owned quantity
    for (const [id, amount] of Object.entries(ownedCurrency)) {
      balance[Number(id)] = (balance[Number(id)] || 0) + amount;
    }

    // 2. Sum all acquisition/consumption results
    for (const [key, data] of Object.entries(acquiredItemsResult.totalItems)) {
      const [type, idStr] = key.split('_');
      // Include only materials (Item, Currency) in the balance
      if (type === 'Item' || type === 'Currency') {
        // const id = `${type}_${Number(idStr)}`;
        const id = Number(idStr);
        balance[id] = (balance[id] || 0) + data.amount;
      }
    }
    return balance;
  }, [ownedCurrency, acquiredItemsResult]);

  const handleMainTabClick = (tabId: MainTabId) => {
    setActiveMainTab(tabId);
    // If sub-tabs exist, automatically activate the first one
    // const mainTab = TABS.find((t) => t.id === tabId);
  };

  return (
    <>
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start">
        {/* Mobile Navigation (< lg) */}
        <div ref={tabNavRef} className="lg:hidden z-30 w-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-gray-200 dark:border-neutral-800 shadow-sm">
          {/* Level 1: Main Tabs (Grid Layout - No Scroll) */}
          <div className="p-2">
            <div className="grid grid-cols-3 gap-1">
              {TABS.map((tab) => {
                const isActive = activeMainTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleMainTabClick(tab.id)}
                    className={`
                            py-2 px-1 text-xs font-bold rounded-md transition-all duration-200 border
                            ${isActive ? 'bg-white border-blue-200 text-blue-600 shadow-sm dark:bg-neutral-800 dark:border-blue-900 dark:text-blue-400' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-neutral-800'}
                          `}
                  >
                    {tab.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Level 2: Sub Tabs (Pill wrap) - Only show if exists */}
          {TABS.find((t) => t.id === activeMainTab)?.subTabs && (
            <div className="flex flex-wrap justify-center gap-2 px-4 pb-3 pt-1 bg-gray-50/50 dark:bg-neutral-800/30 border-t border-gray-100 dark:border-neutral-800">
              {TABS.find((t) => t.id === activeMainTab)!.subTabs!.map((subTab) => {
                const isActive = activeSubTab === subTab.id;
                return (
                  <button
                    key={subTab.id}
                    onClick={() =>
                      setActiveSubTabs((prev) => ({
                        ...prev,
                        [activeMainTab]: subTab.id,
                      }))
                    }
                    className={`
                            px-3 text-[11px] font-bold transition-all
                            ${isActive ? ' border-b-2 border-blue-200 text-blue-700 dark:text-blue-300' : ' border-gray-200 text-gray-500 dark:text-gray-400'}
                          `}
                  >
                    {subTab.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Main Content Area */}

        <main className={mainContentClasses}>
          <div key={activeMainTab} className="animate-fade-in">
            {/* BONUS TAB */}
            {activeMainTab === 'bonus' && (
              <div className="space-y-8">
                <TotalBonusDisplay eventData={eventData} iconData={iconData} totalBonus={totalBonus} />
                <BonusSelector eventId={eventId} eventData={eventData} iconData={iconData} allStudents={allStudents} studentPortraits={studentPortraits} onBonusCalculate={setTotalBonus} />
              </div>
            )}

            {/* GOALS TAB */}
            {activeMainTab === 'goals' && (
              <div className="space-y-8">
                {activeSubTab === 'shop' && <ShopPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setShopResult} allStages={allStages} totalBonus={totalBonus} />}
                {activeSubTab === 'growth' && (
                  <StudentGrowthPlanner eventId={eventId} eventData={eventData} iconData={iconData} allStudents={allStudents} onCalculate={setStudentGrowthNeeds} studentPortraits={studentPortraits} />
                )}
                {activeSubTab === 'mission' && <MissionPlanner eventId={eventId} eventData={eventData} iconData={iconData} allStages={allStages} onCalculate={setMissionResult} />}
                {eventData?.total_reward && activeSubTab === 'total_reward' && <TotalRewardPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setTotalRewardResult} />}
              </div>
            )}

            {/* MINIGAME TAB */}
            {activeMainTab === 'minigame' && (
              <div className="space-y-8">
                {activeSubTab === 'treasure' && eventData?.season.EventContentTypeStr.includes('Treasure') && (
                  <TreasurePlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setTreasureResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'card' && eventData?.season.EventContentTypeStr.includes('CardShop') && (
                  <CardShopPlanner
                    eventId={eventId}
                    eventData={eventData}
                    iconData={iconData}
                    onRatesCalculated={setCardShopRates}
                    rates={cardShopRates}
                    finalCardFlips={finalCardFlips}
                    setFinalCardFlips={setFinalCardFlips}
                    remainingCurrency={finalCurrencyBalance}
                  />
                )}
                {activeSubTab === 'box' && eventData?.box_gacha && (
                  <BoxGachaPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setBoxGachaResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'fortune' && eventData?.fortune_gacha && (
                  <FortuneGachaPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setFortuneGachaResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'dice_race' && eventData?.dice_race && (
                  <DiceRacePlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setDiceRaceResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'minigame_dream' && eventData?.minigame_dream && (
                  <DreamMakerPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setDreamMakerResult} remainingCurrency={finalCurrencyBalance} totalBonus={totalBonus} />
                )}
                {activeSubTab === 'minigame_ccg' && eventData?.minigame_ccg && (
                  <MinigameCCGPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setMinigameCCGResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'minigame_defence' && eventData?.minigame_defense && (
                  <MinigameDefensePlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setMinigameDefenseResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'card_match' && eventData?.concentration && (
                  <CardMatchPlanner eventId={eventId} eventData={eventData} iconData={iconData!} onCalculate={setCardMatchResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'custom' && (
                  <CustomGamePlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setCustomGameResult} remainingCurrency={finalCurrencyBalance} />
                )}
              </div>
            )}

            {/* AP TAB */}
            {activeMainTab === 'ap' && (
              <ApCalculator
                eventId={eventId}
                startTime={eventData.season.EventContentOpenTime}
                endTime={eventData.season.EventContentCloseTime || eventData.season.ExtensionTime}
                onCalculate={setAvailableAp}
                iconData={iconData}
              />
            )}

            {/* FARMING TAB */}
            {activeMainTab === 'farming' && activeSubTab === 'stages' && (
              <FarmingPlanner
                eventId={eventId}
                eventData={eventData}
                iconData={iconData}
                allStages={allStages}
                availableAp={availableAp}
                setAvailableAp={setAvailableAp}
                neededItems={finalCurrencyBalance}
                totalBonus={totalBonus}
                onCalculate={setFarmingResult}
              />
            )}

            {/* Next Step Navigation (Bottom) */}
            {!isLastTab && nextTab && (
              <div className="mt-12 flex justify-end">
                <button
                  onClick={() => {
                    const offset = window.innerWidth < 1024 ? 0 : 0;
                    window.scrollTo({ top: offset, behavior: 'smooth' });
                    handleMainTabClick(nextTab!.id);
                  }}
                  className="
                            group flex items-center gap-2 px-6 py-3 
                            bg-blue-600 text-white text-sm font-bold rounded-full shadow-md 
                            hover:bg-blue-700 hover:shadow-lg active:scale-95 transition-all
                          "
                >
                  <span>{t('ui.continueTo', { tabName: nextTabName })}</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </button>
              </div>
            )}

            {/* Export/Import */}
            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-neutral-700">
              <ExportImportPanel />
            </div>
          </div>
        </main>

        {/* Desktop Sidebar Navigation (>= lg) */}

        <div className="hidden lg:block w-64 shrink-0 sticky top-4 self-start pr-4 mt-6 ml-6">
          <nav className="p-4 bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700 shadow-sm max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="mb-4 px-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Menu</div>
            <div className="space-y-1">
              {TABS.map((tab) => {
                const isActiveMain = activeMainTab === tab.id;
                return (
                  <div key={tab.id} className="mb-2">
                    {/* Main Tab Button */}
                    <button
                      onClick={() => handleMainTabClick(tab.id)}
                      className={`
                          w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-all flex justify-between items-center
                          ${isActiveMain ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shadow-sm ring-1 ring-blue-100 dark:ring-blue-800' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-neutral-700'}
                        `}
                    >
                      <span>{tab.name}</span>
                      {/* Arrow Icon */}
                      {tab.subTabs && <span className={`text-[10px] transition-transform duration-200 ${isActiveMain ? 'rotate-90 text-blue-500' : 'text-gray-400'}`}>▶</span>}
                    </button>

                    {/* Sub Tabs List (Expanded if Main is active) */}
                    {isActiveMain && tab.subTabs && (
                      <div className="mt-1 ml-3 pl-3 border-l-2 border-gray-100 dark:border-neutral-700 space-y-0.5 animate-fade-in">
                        {tab.subTabs.map((subTab) => {
                          const isActiveSub = activeSubTab === subTab.id;
                          return (
                            <button
                              key={subTab.id}
                              onClick={() =>
                                setActiveSubTabs((prev) => ({
                                  ...prev,
                                  [activeMainTab]: subTab.id,
                                }))
                              }
                              className={`
                                  w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors
                                  ${isActiveSub ? 'text-blue-600 bg-blue-50/50 dark:text-blue-400 dark:bg-blue-900/10' : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'}
                                `}
                            >
                              {subTab.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      {/* Floating Status Bar (Fixed at Bottom) */}
      <FloatingCurrencyStatus
        eventId={eventId}
        eventData={eventData}
        iconData={iconData}
        ownedCurrency={ownedCurrency}
        setOwnedCurrency={setOwnedCurrency}
        remainingCurrency={finalCurrencyBalance}
        acquiredItemsResult={acquiredItemsResult}
      />
    </>
  );
};
