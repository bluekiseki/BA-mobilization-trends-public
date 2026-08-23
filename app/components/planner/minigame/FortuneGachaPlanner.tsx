import { useState, useCallback, useEffect } from 'react';
import { ItemIcon } from '../common/Icon';
import { SimRunButton } from '../common/SimRunButton';
import type { EventData, IconData } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';

import { useTranslation } from 'react-i18next';
import { useIsDarkState } from '~/store/isDarkState';
import { getLocalizeEtcName } from '../common/locale';
import type { Locale } from '~/utils/i18n/config';
import { runAsync } from '~/utils/runAsync';

import { type FortuneGachaAvgRates } from '~/types/minigame/fortuneGacha';
import type { WithNonNullable } from '~/utils/WithNonNullable';

export type { FortuneGachaAvgRates };

// --- Type definitions ---
export type FortuneGachaResult = {
  cost: { key: string; amount: number };
  rewards: Record<string, number>;
};

interface FortuneGachaPlannerProps {
  eventId: number;
  eventData: WithNonNullable<EventData, 'fortune_gacha'>;
  iconData: IconData;
  onCalculate: (result: FortuneGachaResult | null) => void;
  remainingCurrency: Record<number, number>;
}

// --- Simulation Engine ---
export const runSimulation = (gachaData: EventData['fortune_gacha'], simRuns: number): { avgCost: number; avgRewards: Record<string, number> } => {
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
  const [isRunning, setIsRunning] = useState(false);

  const { t, i18n } = useTranslation('planner', { keyPrefix: 'fortune_gacha' });
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const { isDark } = useIsDarkState();
  const {
    fortuneGachaSimRuns: simRuns,
    fortuneGachaFinalPulls: finalPulls,
    fortuneGachaAvgRates: avgRates,
    setFortuneGachaSimRuns: setSimRuns,
    setFortuneGachaFinalPulls: setFinalPulls,
    setFortuneGachaAvgRates: setAvgRates,
  } = usePlanForEvent(eventId);

  const gachaData = eventData.fortune_gacha;

  const handleRunSimulation = useCallback(() => {
    if (!gachaData) return;
    setIsRunning(true);
    void runAsync(() => {
      const results = runSimulation(gachaData, simRuns);
      setAvgRates(results);
    }).finally(() => setIsRunning(false));
  }, [gachaData, simRuns]);

  useEffect(() => {
    if (!avgRates || finalPulls <= 0) {
      onCalculate(null);
      return;
    }

    const costInfo = gachaData.shop[0].CostGoods;
    const costKey = `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}`;

    const totalRewards: Record<string, number> = {};
    for (const [key, amount] of Object.entries(avgRates.avgRewards)) {
      totalRewards[key] = amount * finalPulls;
    }

    onCalculate({
      cost: { key: costKey, amount: avgRates.avgCost * finalPulls },
      rewards: totalRewards,
    });
  }, [avgRates, finalPulls, gachaData]);

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
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title')}</h2>
      <div className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-700">
        <div className="py-3 space-y-2">
          <h3 className="font-bold text-sm dark:text-neutral-200">{t('calcAvgRewards')}</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={simRuns}
              onChange={(e) => setSimRuns(parseInt(e.target.value) || 10000)}
              className="w-full p-2 rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
            />
            <SimRunButton
              isRunning={isRunning}
              onClick={handleRunSimulation}
              className="bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shrink-0"
            >
              {t_ui('run')}
            </SimRunButton>
          </div>
          {avgRates && (
            <div className="space-y-2 pt-1">
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

        <div className="py-3 space-y-2">
          <h3 className="font-bold text-sm dark:text-neutral-200">{t('planTotalPulls')}</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={finalPulls || ''}
              onChange={(e) => setFinalPulls(parseInt(e.target.value) || 0)}
              className="w-full p-2 text-lg rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
              placeholder={t('totalPullsPlaceholder')}
            />
            <button
              onClick={handleSetMaxPulls}
              className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg shrink-0 disabled:bg-neutral-400 dark:disabled:bg-neutral-600"
              disabled={!avgRates}
              title={!avgRates ? t('runAvgCalcFirst') : t('setMaxPullsTooltip')}
            >
              {t('setToMax')}
            </button>
          </div>
        </div>

        {/* Probability Table */}
        {(() => {
          const totalBaseProb = gachaData.shop.reduce((sum, item) => sum + item.Prob, 0);
          const pityInfo = gachaData.modify[0];
          const rarityColors: Record<'light' | 'dark', Record<number, string>> = {
            light: { 0: '#bdc5d0', 1: '#90baec', 2: '#d6ad81', 3: '#a88aec', 4: '#ebc355' },
            dark: { 0: '#8c939e', 1: '#658dbf', 2: '#a87d51', 3: '#7a5bbe', 4: '#c9a227' },
          };
          const theme = isDark === 'dark' ? 'dark' : 'light';

          // Group items by reward signature + max probability + name
          const rewardSignatureMap = new Map<string, (typeof gachaData.shop)[0][]>();
          gachaData.shop.forEach((item) => {
            const rewardSig = item.RewardParcelId.map((id, idx) => `${item.RewardParcelTypeStr[idx]}_${id}_${item.RewardParcelAmount[idx]}`)
              .sort()
              .join('|');
            const name = getLocalizeEtcName(item.FortuneGachaGroup.LocalizeEtc, locale);
            const signature = `${rewardSig}|${item.ProbModifyLimit}|${name}`;
            if (!rewardSignatureMap.has(signature)) {
              rewardSignatureMap.set(signature, []);
            }
            rewardSignatureMap.get(signature)?.push(item);
          });

          const groupedItems = Array.from(rewardSignatureMap.values());

          return (
            <div className="py-3">
              <h3 className="font-bold text-sm mb-2 dark:text-neutral-200">3. {t('probTable')}</h3>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-600">
                    <th className="text-left py-1 pr-2 font-semibold text-neutral-600 dark:text-neutral-400">{t('name')}</th>
                    <th className="text-right py-1 pr-2 font-semibold text-neutral-600 dark:text-neutral-400">{t('baseProb')}</th>
                    <th className="text-right py-1 pr-2 font-semibold text-neutral-600 dark:text-neutral-400">{t('maxProb')}</th>
                    <th className="text-left py-1 font-semibold text-neutral-600 dark:text-neutral-400">{t('rewards')}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedItems.map((items) => {
                    const groupProb = items.reduce((sum, item) => sum + item.Prob, 0);
                    const basePct = ((groupProb / totalBaseProb) * 100).toFixed(2);
                    const firstItem = items[0];
                    const hasPityChange = items.some((item) => item.ProbModifyValue !== 0);

                    // For pity, use the first item's modification pattern (or aggregate if needed)
                    const groupModifyProb = items.reduce((sum, item) => sum + item.ProbModifyLimit, 0);
                    const limitPct = ((groupModifyProb / totalBaseProb) * 100).toFixed(2);
                    const stepsToLimit = hasPityChange ? Math.ceil(Math.abs(groupModifyProb - groupProb) / Math.abs(firstItem.ProbModifyValue)) : 0;
                    const name = getLocalizeEtcName(firstItem.FortuneGachaGroup.LocalizeEtc, locale);
                    const rowBg = rarityColors[theme][firstItem.Grade - 1] + '18';

                    return (
                      <tr key={items.map((item) => item.Id).join('_')} className="border-b border-neutral-100 dark:border-neutral-800" style={{ backgroundColor: rowBg }}>
                        <td className="py-1.5 pr-2 dark:text-neutral-200">{name}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums dark:text-neutral-300">{basePct}%</td>
                        <td
                          className={`py-1.5 pr-2 text-right tabular-nums ${hasPityChange ? (firstItem.ProbModifyValue > 0 ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-red-500 dark:text-red-400 font-semibold') : 'text-neutral-400 dark:text-neutral-500'}`}
                        >
                          {hasPityChange ? (
                            <span title={t('pityDetail', { start: pityInfo.ProbModifyStartCount, steps: stepsToLimit, total: pityInfo.ProbModifyStartCount + stepsToLimit })}>{limitPct}%</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-1.5">
                          <div className="flex flex-wrap gap-1">
                            {firstItem.RewardParcelId.map((id, idx) => {
                              const type = firstItem.RewardParcelTypeStr[idx];
                              const key = `${type}_${id}`;
                              return <ItemIcon key={key} type={type} itemId={String(id)} amount={firstItem.RewardParcelAmount[idx]} size={10} eventData={eventData} iconData={iconData} />;
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">{t('pityNote', { start: pityInfo.ProbModifyStartCount })}</p>
            </div>
          );
        })()}
      </div>
    </>
  );
};
