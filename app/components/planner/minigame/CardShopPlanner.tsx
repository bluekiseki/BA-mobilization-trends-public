// src/components/CardShopPlanner.tsx

import { useState } from 'react';
import { ItemIcon } from '../common/Icon';
import { SimRunButton } from '../common/SimRunButton';
import type { CardShopItem, EventData, IconData } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useEventSettings } from '~/store/planner/useSettingsStore';
import { useTranslation } from 'react-i18next';

import { type CardShopConfig, type CardShopStrategy } from '~/types/minigame/cardShop';
import { runAsync } from '~/utils/runAsync';

export type { CardShopConfig };

export type SimulationResult = {
  costs: Record<string, number>;
  rewards: Record<string, number>;
  totalFlips: number;
};

export type CardShopRates = {
  avgCosts: Record<string, number>;
  avgRewards: Record<string, number>;
  avgFlips: number;
};

interface CardShopPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onRatesCalculated: (rates: CardShopRates | null) => void;
  rates: CardShopRates | null;
  remainingCurrency: Record<number, number>;
  finalCardFlips: number; // Rename: finalCardShopRounds -> finalCardFlips
  setFinalCardFlips: React.Dispatch<React.SetStateAction<number>>; // Rename
}

// Simulation engine
const runCardShopSimulation = (cardData: CardShopItem[], numRounds: number, strategy: CardShopStrategy): SimulationResult => {
  const totalCosts: Record<string, number> = {};
  const totalRewards: Record<string, number> = {};
  let totalFlips = 0; // Total flip counter

  // 1. Pre-sort card pools by each RefreshGroup
  const groupPools: Record<number, CardShopItem[]> = {
    1: cardData.filter((c) => c.RefreshGroup === 1),
    2: cardData.filter((c) => c.RefreshGroup === 2),
    3: cardData.filter((c) => c.RefreshGroup === 3),
    4: cardData.filter((c) => c.RefreshGroup === 4),
  };

  const drawWeightedRandom = (cards: CardShopItem[]) => {
    if (!cards || cards.length === 0) return null;
    const totalWeight = cards.reduce((sum, card) => sum + card.Prob, 0);
    let random = Math.random() * totalWeight;
    for (const card of cards) {
      if (random < card.Prob) return card;
      random -= card.Prob;
    }
    return cards[cards.length - 1];
  };

  for (let i = 0; i < numRounds; i++) {
    const costArray = cardData[0].CostGoods.ConsumeExtraAmount;
    const costCurrencyId = cardData[0].CostGoods.ConsumeParcelId[0];
    const costKey = `Item_${costCurrencyId}`;

    // 2. The nth draw is performed from the nth group
    let no_sr_cnt = 0;
    for (let flipIndex = 0; flipIndex < 4; flipIndex++) {
      const currentPool = groupPools[no_sr_cnt + 1];
      const card = drawWeightedRandom(currentPool);
      if (!card) continue;

      if (!card) continue; // Skip if the group has no cards

      // Accumulate cost and reward
      totalFlips++;
      totalCosts[costKey] = (totalCosts[costKey] || 0) + costArray[flipIndex];
      card.RewardParcelId.forEach((id, idx) => {
        const key = `${card.RewardParcelTypeStr[idx]}_${id}`;
        totalRewards[key] = (totalRewards[key] || 0) + card.RewardParcelAmount[idx];
      });

      // 3. Decide whether to stop the round based on strategy
      if (strategy === 'one-open') break;
      if (strategy === 'sr-reset' && card.Rarity >= 2) break;

      if (card.Rarity < 2) no_sr_cnt += 1;
      // 'all-open' is always executed 4 times
    }
  }

  return { costs: totalCosts, rewards: totalRewards, totalFlips };
};

export const CardShopPlanner = ({ eventId, eventData, iconData, onRatesCalculated, rates, remainingCurrency, finalCardFlips, setFinalCardFlips }: CardShopPlannerProps) => {
  // const [config, setConfig] = useState({
  //   rounds: 5000,
  //   strategy: 'sr-reset' as CardShopStrategy,
  // });

  const { cardShopConfig: config, setCardShopConfig: setConfig } = usePlanForEvent(eventId);
  const { t } = useTranslation('planner');
  const [isRunning, setIsRunning] = useState(false);

  // const [result, setResult] = useState<SimulationResult | null>(null);
  // const [simulationTotalResult, setSimulationTotalResult] = useState<SimulationResult | null>(null);
  const { cardSimResult: simulationTotalResult, setCardSimResult: setSimulationTotalResult } = useEventSettings(eventId);

  const cardShopData = eventData.card_shop;
  // const refreshGroups = useMemo(() => {
  //   if (!cardShopData) return [];
  //   return [...new Set(cardShopData.map((c) => c.RefreshGroup))];
  // }, [cardShopData]);

  if (!config) return;

  const handleRun = () => {
    const cardPool = cardShopData || [];
    if (cardPool.length === 0 || config.rounds === 0) return;

    setIsRunning(true);
    void runAsync(() => {
      const simResult = runCardShopSimulation(cardPool, config.rounds, config.strategy);
      setSimulationTotalResult(simResult);

      const avgCosts: Record<string, number> = {};
      const avgRewards: Record<string, number> = {};
      Object.entries(simResult.costs).forEach(([key, total]) => (avgCosts[key] = total / config.rounds));
      Object.entries(simResult.rewards).forEach(([key, total]) => (avgRewards[key] = total / config.rounds));
      const avgFlips = simResult.totalFlips / config.rounds;

      onRatesCalculated({ avgCosts, avgRewards, avgFlips });
    }).finally(() => setIsRunning(false));
  };
  const handleSetMaxRounds = () => {
    if (!rates || !remainingCurrency || rates.avgFlips <= 0) return;

    let maxRequiredFlips = 0;

    for (const itemIdStr in remainingCurrency) {
      const itemId = Number(itemIdStr);
      const rewardKey = `Item_${itemId}`;
      const avgRewardPerRound = rates.avgRewards[rewardKey];
      const avgRewardPerFlip = avgRewardPerRound / rates.avgFlips;
      const deficit = remainingCurrency[itemId] - finalCardFlips * avgRewardPerFlip;

      if (deficit < 0 && avgRewardPerRound > 0) {
        // 2. Calculate the 'total number of flips' needed to fill the shortage
        const requiredFlips = Math.ceil(-deficit / avgRewardPerFlip);

        // 3. Since all materials must be obtained, select the largest flip count
        if (requiredFlips > maxRequiredFlips) {
          maxRequiredFlips = requiredFlips;
        }
      }
    }

    // 4. Update state with the calculated maximum flip count
    setFinalCardFlips(maxRequiredFlips);
  };

  const strategies = [
    { id: 'sr-reset', label: t('label.resetOnSr') },
    { id: 'all-open', label: t('label.openAllCards') },
    { id: 'one-open', label: t('label.openOneAndReset') },
  ];

  return (
    <>
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('page.cardShopSimulator')}</h2>
      <div className="mt-4 space-y-4">
        {/* Settings UI */}
        <div>
          <label className="text-sm font-bold dark:text-neutral-300">{t('cardShop.simulationStrategy')}</label>
          <div className="flex gap-2 mt-1">
            {strategies.map((s) => (
              <button
                key={s.id}
                onClick={() => setConfig(((p) => ({ ...p, strategy: s.id as CardShopStrategy }))(config))}
                className={`${config.strategy === s.id ? 'bg-blue-500 text-white' : 'bg-white dark:bg-neutral-700 dark:text-neutral-300 dark:border-neutral-600 dark:hover:bg-neutral-600'} border rounded-md px-3 py-1 text-sm transition-colors`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-bold">{t('ui.simulationCount')}</label>
          <input type="number" value={config.rounds} onChange={(e) => setConfig(((p) => ({ ...p, rounds: parseInt(e.target.value) || 0 }))(config))} className="w-full p-2 mt-1 rounded border" />
        </div>
        <SimRunButton isRunning={isRunning} onClick={handleRun} className="w-full bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-bold py-2 rounded-lg">
          {t('button.runSimulation')}
        </SimRunButton>

        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/40 rounded-lg">
          <h3 className="font-bold text-sm mb-2 dark:text-yellow-200">{t('cardShop.planSettingsFlipCount')}</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder={t('cardShop.flipCountPlaceholder')}
              className="w-full p-2 text-lg rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
              value={finalCardFlips || ''}
              onChange={(e) => setFinalCardFlips(parseInt(e.target.value) || 0)}
            />
            <button
              onClick={handleSetMaxRounds}
              className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg shrink-0 disabled:bg-neutral-400 dark:disabled:bg-neutral-600"
              disabled={!rates}
              title={!rates ? t('cardShop.runEfficiencyCalcFirst') : t('cardShop.calcFlipsForNeededItems')}
            >
              {t('button.setToMax')}
            </button>
          </div>
        </div>

        {/* Result UI */}
        {simulationTotalResult && rates && (
          <div>
            <h3 className="font-bold dark:text-neutral-200">{t('cardShop.simulationStats').replace('{rounds}', config.rounds.toLocaleString())}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div className="bg-red-50 dark:bg-red-900/40 p-3 rounded-lg">
                <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('cardShop.avgCostPerFlip')}</h4>
                <div className="flex flex-wrap gap-2">
                  {/* Apply flex-wrap to display icons only */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(simulationTotalResult.costs).map(([key, totalAmount]) => {
                      const avgAmountPerFlip = totalAmount / simulationTotalResult.totalFlips;
                      return <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={avgAmountPerFlip} size={11} eventData={eventData} iconData={iconData} />;
                    })}
                  </div>
                </div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/40 p-3 rounded-lg">
                <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('cardShop.avgRewardPerFlip')}</h4>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                  {Object.entries(simulationTotalResult.rewards)
                    .sort(([, a], [, b]) => b - a)
                    .map(([key, totalAmount]) => {
                      const avgAmount = totalAmount / simulationTotalResult.totalFlips;
                      if (avgAmount < 0.001) return null;
                      const [type, id] = key.split('_');

                      return (
                        <ItemIcon
                          key={key}
                          type={type}
                          itemId={id}
                          amount={avgAmount} // Pass the exact average value to the tooltip
                          size={11} // Adjust icon size
                          eventData={eventData}
                          iconData={iconData}
                        />
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
