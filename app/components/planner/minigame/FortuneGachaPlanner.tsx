import { useState, useCallback, useEffect } from 'react';
import { ItemIcon } from '../common/Icon';
import type { EventData, IconData } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { ChevronIcon } from '~/components/Icon';
import { useTranslation } from 'react-i18next';

// --- Type definitions ---
export type FortuneGachaResult = {
  cost: { key: string; amount: number };
  rewards: Record<string, number>;
};

interface FortuneGachaPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onCalculate: (result: FortuneGachaResult | null) => void;
  remainingCurrency: Record<number, number>;
}

export interface FortuneGachaAvgRates {
  avgCost: number;
  avgRewards: Record<string, number>;
}

// --- Simulation Engine ---
const runSimulation = (gachaData: EventData['fortune_gacha'], simRuns: number): { avgCost: number; avgRewards: Record<string, number> } => {
  if (!gachaData || simRuns <= 0) return { avgCost: 0, avgRewards: {} };

  const totalRewards: Record<string, number> = {};
  const costPerPull = gachaData.shop[0].CostGoods.ConsumeParcelAmount[0];
  const totalPulls = simRuns;

  const pityInfo = gachaData.modify[0];
  const baseProbs = gachaData.shop.map((item) => item.Prob);
  const totalBaseProb = baseProbs.reduce((sum, p) => sum + p, 0);

  let currentProbs = [...baseProbs];
  let pityCounter = 0;

  for (let i = 0; i < totalPulls; i++) {
    // 1. Apply probability correction
    if (pityCounter >= pityInfo.ProbModifyStartCount) {
      gachaData.shop.forEach((item, index) => {
        if (item.ProbModifyValue > 0) {
          currentProbs[index] = Math.min(currentProbs[index] + item.ProbModifyValue, item.ProbModifyLimit);
        } else if (item.ProbModifyValue < 0) {
          currentProbs[index] = Math.max(currentProbs[index] + item.ProbModifyValue, item.ProbModifyLimit);
        }
      });
    }

    // 2. Normalize probabilities
    const currentTotalProb = currentProbs.reduce((sum, p) => sum + p, 0);
    const normalizedProbs = currentProbs.map((p) => (p * totalBaseProb) / currentTotalProb);

    // 3. Execute draw
    const rand = Math.random() * totalBaseProb;
    let cumulativeProb = 0;
    let selectedItemIndex = -1;

    for (let j = 0; j < normalizedProbs.length; j++) {
      cumulativeProb += normalizedProbs[j];
      if (rand < cumulativeProb) {
        selectedItemIndex = j;
        break;
      }
    }

    const selectedItem = gachaData.shop[selectedItemIndex];

    // 4. Add reward and update pity counter
    selectedItem.RewardParcelId.forEach((id, index) => {
      const type = selectedItem.RewardParcelTypeStr[index];
      const key = `${type}_${id}`;
      totalRewards[key] = (totalRewards[key] || 0) + selectedItem.RewardParcelAmount[index];
    });

    if (selectedItem.Grade === pityInfo.TargetGrade) {
      pityCounter = 0;
      currentProbs = [...baseProbs];
    } else {
      pityCounter++;
    }
  }

  // 5. Calculate average values
  const avgRewards: Record<string, number> = {};
  for (const [key, amount] of Object.entries(totalRewards)) {
    avgRewards[key] = amount / totalPulls;
  }

  return { avgCost: costPerPull, avgRewards };
};

// --- React Component ---
export const FortuneGachaPlanner = ({ eventId, eventData, iconData, onCalculate, remainingCurrency }: FortuneGachaPlannerProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { t } = useTranslation('planner', { keyPrefix: 'fortune_gacha' });
  const { plan, setFortuneGachaSimRuns: setSimRuns, setFortuneGachaFinalPulls: setFinalPulls, setFortuneGachaAvgRates: setAvgRates } = usePlanForEvent(eventId);

  const { fortuneGachaSimRuns: simRuns, fortuneGachaFinalPulls: finalPulls, fortuneGachaAvgRates: avgRates } = plan;

  const gachaData = eventData.fortune_gacha;

  if (simRuns === undefined || finalPulls === undefined) {
    return null;
  }

  const handleRunSimulation = useCallback(() => {
    if (!gachaData) return;
    const results = runSimulation(gachaData, simRuns);
    setAvgRates(results);
  }, [gachaData, simRuns]);

  useEffect(() => {
    if (!avgRates || finalPulls <= 0) {
      onCalculate(null);
      return;
    }

    const costInfo = gachaData!.shop[0].CostGoods;
    const costKey = `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}`;

    const totalRewards: Record<string, number> = {};
    for (const [key, amount] of Object.entries(avgRates.avgRewards)) {
      totalRewards[key] = amount * finalPulls;
    }

    onCalculate({
      cost: { key: costKey, amount: avgRates.avgCost * finalPulls },
      rewards: totalRewards,
    });
  }, [avgRates, finalPulls, onCalculate, gachaData]);

  const handleSetMaxPulls = useCallback(() => {
    if (!avgRates || !gachaData) {
      alert('Please do the average compensation calculation first.');
      return;
    }

    // 1. Check the currency ID consumed by this minigame
    const costItemId = gachaData.shop[0].CostGoods.ConsumeParcelId[0];

    // 2. Check the amount of that currency I currently have
    const availableGachaCurrency = remainingCurrency[costItemId] || 0;

    // 3. Check the average consumption per draw
    const costPerPull = avgRates.avgCost;

    if (availableGachaCurrency <= 0 || costPerPull <= 0) {
      setFinalPulls(finalPulls + 0);
      return;
    }

    // 4. Calculate the maximum possible draws

    const affordablePulls = Math.floor(availableGachaCurrency / costPerPull);
    setFinalPulls(finalPulls + affordablePulls);
  }, [avgRates, remainingCurrency, gachaData]);

  if (!gachaData) return null;

  const costItem = gachaData.shop[0].CostGoods;
  const costKey = `${costItem.ConsumeParcelTypeStr[0]}_${costItem.ConsumeParcelId[0]}`;

  return (
    <>
      <div className="flex justify-between items-center cursor-pointer group" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h2>
        <span className="text-2xl transition-transform duration-300 group-hover:scale-110">
          <ChevronIcon className={isCollapsed ? 'rotate-180' : ''} />
        </span>
      </div>
      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-neutral-800/50 rounded-lg space-y-2">
            <h3 className="font-bold text-sm dark:text-gray-200">{t('calcAvgRewards')}</h3>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={simRuns}
                onChange={(e) => setSimRuns(parseInt(e.target.value) || 1000)}
                className="w-full p-2 rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
              />
              <button onClick={handleRunSimulation} className="bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shrink-0">
                {t('run')}
              </button>
            </div>

            {avgRates && (
              <div className="mt-2 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400">{t('avgRewardsPerPull')}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(avgRates.avgRewards)
                      .sort(([, a], [, b]) => b - a)
                      .map(([key, amount]) => {
                        const [type, id] = key.split('_');
                        return <ItemIcon key={key} type={type} itemId={id} amount={amount} size={10} eventData={eventData} iconData={iconData} />;
                      })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400">{t('avgCostPerPull')}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <ItemIcon type={costKey.split('_')[0]} itemId={costKey.split('_')[1]} amount={avgRates.avgCost} size={10} eventData={eventData} iconData={iconData} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/40 rounded-lg">
            <h3 className="font-bold text-sm mb-2 dark:text-yellow-200">{t('planTotalPulls')}</h3>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={finalPulls || ''}
                onChange={(e) => setFinalPulls(parseInt(e.target.value) || 0)}
                className="w-full p-2 text-lg rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
                placeholder={t('totalPullsPlaceholder')}
              />
              <button
                onClick={handleSetMaxPulls}
                className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg shrink-0 disabled:bg-gray-400 dark:disabled:bg-neutral-600"
                disabled={!avgRates}
                title={!avgRates ? t('runAvgCalcFirst') : t('setMaxPullsTooltip')}
              >
                {t('setToMax')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
