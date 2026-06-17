// src/components/BoxGachaPlanner.tsx

import { useMemo, useCallback, useEffect } from 'react';
import { ItemIcon } from '../common/Icon';
import type { EventData, IconData } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
// import { ChevronIcon } from '~/components/Icon';
import { useTranslation } from 'react-i18next';
import type { WithNonNullable } from '~/utils/WithNonNullable';

export type BoxGachaResult = {
  cost: { key: string; amount: number };
  rewards: Record<string, number>;
};

interface BoxGachaPlannerProps {
  eventId: number;
  eventData: WithNonNullable<EventData, 'box_gacha'>;
  iconData: IconData;
  onCalculate: (result: BoxGachaResult | null) => void;
  remainingCurrency: Record<number, number>;
}

export const BoxGachaPlanner = ({ eventId, eventData, iconData, onCalculate, remainingCurrency }: BoxGachaPlannerProps) => {
  const { boxGachaStartBox: startBox, boxGachaEndBox: finalTotalBoxes, setBoxGachaStartBox: setStartBox, setBoxGachaEndBox: setFinalTotalBoxes } = usePlanForEvent(eventId);
  const { t } = useTranslation('planner', { keyPrefix: 'box_gacha' });

  const boxGachaData = eventData.box_gacha;

  // Pre-calculate the contents of each box (round)
  const boxContents = useMemo(() => {
    const contents: Record<number, { cost: number; rewards: Record<string, number> }> = {};
    const costPerDraw = boxGachaData.manage[0].Goods.ConsumeParcelAmount[0];

    for (const roundInfo of boxGachaData.manage) {
      const roundNum = roundInfo.Round;
      const itemsInBox = boxGachaData.shop.filter((item) => item.Round === roundNum);

      let totalItemsInBox = 0;
      const rewards: Record<string, number> = {};

      for (const item of itemsInBox) {
        totalItemsInBox += item.GroupElementAmount;
        const rewardInfo = item.Goods[0];
        const key = `${rewardInfo.ParcelTypeStr[0]}_${rewardInfo.ParcelId[0]}`;
        const totalAmount = rewardInfo.ParcelAmount[0] * item.GroupElementAmount;
        rewards[key] = (rewards[key] || 0) + totalAmount;
      }

      contents[roundNum] = {
        cost: totalItemsInBox * costPerDraw,
        rewards,
      };
    }
    return contents;
  }, [boxGachaData]);

  const allSameCost = useMemo(() => {
    const rounds = Object.values(boxContents);
    if (rounds.length <= 1) return true;
    const first = rounds[0].cost;
    return rounds.every((r) => r.cost === first);
  }, [boxContents]);

  const handleSetMaxBoxes = useCallback(() => {
    const repeatingBoxInfo = boxGachaData.manage.find((m) => m.IsLoop);
    if (!repeatingBoxInfo) return;

    const repeatingBoxNum = repeatingBoxInfo.Round;
    const repeatingBoxRewards = boxContents[repeatingBoxNum].rewards;
    let maxRequiredBoxes = 0;

    for (const [itemIdStr, deficit] of Object.entries(remainingCurrency)) {
      if (deficit < 0) {
        const rewardKey = `Item_${itemIdStr}`;
        const avgRewardPerBox = repeatingBoxRewards[rewardKey];
        if (avgRewardPerBox > 0) {
          const required = Math.ceil(-deficit / avgRewardPerBox);
          if (required > maxRequiredBoxes) {
            maxRequiredBoxes = required;
          }
        }
      }
    }

    const nonRepeatingBoxes = boxGachaData.manage.filter((m) => !m.IsLoop).length;
    setFinalTotalBoxes(nonRepeatingBoxes + maxRequiredBoxes);
  }, [boxGachaData, boxContents, remainingCurrency]);

  useEffect(() => {
    if (finalTotalBoxes < startBox) {
      onCalculate(null);
      return;
    }

    const costInfo = boxGachaData.manage[0].Goods;
    const costItemKey = `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}`;

    let totalCost = 0;
    const totalRewards: Record<string, number> = {};
    const repeatingBoxInfo = boxGachaData.manage.find((m) => m.IsLoop);
    if (!repeatingBoxInfo) return;
    const repeatingBoxNum = repeatingBoxInfo.Round;

    for (let i = startBox; i <= finalTotalBoxes; i++) {
      // Change loop start point to startBox
      const currentBoxNum = i < repeatingBoxNum ? i : repeatingBoxNum;
      const currentBox = boxContents[currentBoxNum];

      totalCost += currentBox.cost;
      for (const [key, amount] of Object.entries(currentBox.rewards)) {
        totalRewards[key] = (totalRewards[key] || 0) + amount;
      }
    }

    onCalculate({
      cost: { key: costItemKey, amount: totalCost },
      rewards: totalRewards,
    });
  }, [startBox, finalTotalBoxes, boxContents, boxGachaData]);

  return (
    <>
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title')}</h2>
      <div className="mt-4 space-y-4">
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/40 rounded-lg">
          <h3 className="font-bold text-sm mb-2 dark:text-yellow-200">{t('planSettingsBoxRange')}</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              className="w-full p-2 text-lg rounded border text-center dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
              value={startBox || ''}
              onChange={(e) => setStartBox(parseInt(e.target.value) || 1)}
            />
            <span className="shrink-0 dark:text-neutral-300">{t('fromBox')}</span>
            <input
              type="number"
              min={startBox}
              className="w-full p-2 text-lg rounded border text-center dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
              value={finalTotalBoxes || ''}
              onChange={(e) => setFinalTotalBoxes(parseInt(e.target.value) || 0)}
            />
            <span className="shrink-0 dark:text-neutral-300">{t('toBox')}</span>
            <button onClick={handleSetMaxBoxes} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg shrink-0" title={t('setMaxBoxesTooltip')}>
              {t('setToMax')}
            </button>
          </div>
        </div>

        {boxContents &&
          (() => {
            const costInfo = boxGachaData.manage[0].Goods;
            const costItemKey = `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}`;
            const commonCost = allSameCost ? Object.values(boxContents)[0].cost : null;

            return (
              <div className="mt-4">
                <h3 className="font-bold dark:text-neutral-200 mb-2">{t('roundBreakdown')}</h3>

                {commonCost !== null && (
                  <div className="flex items-center gap-2 mb-3 p-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg md:hidden">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">{t('roundCost')}</span>
                    <ItemIcon type={costItemKey.split('_')[0]} itemId={costItemKey.split('_')[1]} amount={commonCost} size={8} eventData={eventData} iconData={iconData} />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-neutral-100 dark:bg-neutral-700">
                        <th className="text-left p-2 border border-neutral-300 dark:border-neutral-600 dark:text-neutral-200 whitespace-nowrap">{t('roundHeader')}</th>
                        <th className="hidden md:table-cell text-left p-2 border border-neutral-300 dark:border-neutral-600 dark:text-neutral-200 whitespace-nowrap">{t('totalCost')}</th>
                        <th className="text-left p-2 border border-neutral-300 dark:border-neutral-600 dark:text-neutral-200">{t('totalRewards')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boxGachaData.manage.map((roundInfo) => {
                        const roundNum = roundInfo.Round;
                        const box = boxContents[roundNum];
                        if (!box) return null;
                        return (
                          <tr key={roundNum} className="border-b border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                            <td className="p-2 border border-neutral-300 dark:border-neutral-600 dark:text-neutral-300 font-medium whitespace-nowrap">
                              {roundInfo.IsLoop ? t('roundLoopLabel', { round: roundNum }) : t('roundLabel', { round: roundNum })}
                            </td>
                            <td className="hidden md:table-cell p-2 border border-neutral-300 dark:border-neutral-600">
                              <ItemIcon type={costItemKey.split('_')[0]} itemId={costItemKey.split('_')[1]} amount={box.cost} size={8} eventData={eventData} iconData={iconData} />
                            </td>
                            <td className="p-2 border border-neutral-300 dark:border-neutral-600">
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(box.rewards)
                                  .sort(([, a], [, b]) => b - a)
                                  .map(([key, amount]) => {
                                    const [type, id] = key.split('_');
                                    return <ItemIcon key={key} type={type} itemId={id} amount={amount} size={8} eventData={eventData} iconData={iconData} />;
                                  })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

        {finalTotalBoxes >= startBox &&
          (() => {
            const costInfo = boxGachaData.manage[0].Goods;
            const costItemKey = `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}`;

            let totalCost = 0;
            const totalRewards: Record<string, number> = {};
            const repeatingBoxInfo = boxGachaData.manage.find((m) => m.IsLoop);
            if (!repeatingBoxInfo) return;
            const repeatingBoxNum = repeatingBoxInfo.Round;

            for (let i = startBox; i <= finalTotalBoxes; i++) {
              // Change loop start point to startBox
              const currentBoxNum = i < repeatingBoxNum ? i : repeatingBoxNum;
              const currentBox = boxContents[currentBoxNum];
              totalCost += currentBox.cost;
              for (const [key, amount] of Object.entries(currentBox.rewards)) {
                totalRewards[key] = (totalRewards[key] || 0) + amount;
              }
            }

            return (
              <div className="mt-4">
                <h3 className="font-bold dark:text-neutral-200">
                  {t('planResultTitle', {
                    start: startBox,
                    end: finalTotalBoxes,
                  })}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div className="bg-red-50 dark:bg-red-900/40 p-3 rounded-lg">
                    <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('totalCost')}</h4>
                    <div className="flex">
                      <ItemIcon type={costItemKey.split('_')[0]} itemId={costItemKey.split('_')[1]} amount={Math.ceil(totalCost)} size={10} eventData={eventData} iconData={iconData} />
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/40 p-3 rounded-lg">
                    <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('totalRewards')}</h4>
                    <div className="max-h-48 overflow-y-auto pr-2">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(totalRewards)
                          .sort(([, a], [, b]) => b - a)
                          .map(([key, amount]) => {
                            const [type, id] = key.split('_');
                            return <ItemIcon key={key} type={type} itemId={id} amount={Math.round(amount)} size={10} eventData={eventData} iconData={iconData} />;
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>
    </>
  );
};
