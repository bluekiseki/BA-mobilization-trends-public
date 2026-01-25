import { useState, useEffect, useMemo } from 'react';
import { ItemIcon } from './common/Icon';
import type { EventData, IconData } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { ChevronIcon } from '../Icon';
import { useTranslation } from 'react-i18next';

export type TotalRewardResult = {
  cost: { key: string; amount: number } | null;
  rewards: Record<string, number>;
};

interface TotalRewardPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onCalculate: (result: TotalRewardResult | null) => void;
}

export const TotalRewardPlanner = ({ eventId, eventData, iconData, onCalculate }: TotalRewardPlannerProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  // const [currentAmount, setCurrentAmount] = useState(0);
  // const [targetAmount, setTargetAmount] = useState(0);
  const {
    totalRewardCurrentAmount: currentAmount,
    totalRewardTargetAmount: targetAmount,
    setTotalRewardCurrentAmount: setCurrentAmount,
    setTotalRewardTargetAmount: setTargetAmount,
  } = usePlanForEvent(eventId);

  const { t } = useTranslation('planner', { keyPrefix: 'total_reward' });
  const totalRewardData = eventData.total_reward;
  const requiredItemId = useMemo(() => eventData.currency.filter((v) => v.EventContentItemType == 0)[0]?.ItemUniqueId, [eventData.currency]);

  if (currentAmount === undefined || targetAmount === undefined) return null;

  const claimedRewardIds = useMemo(() => {
    const ids = new Set<number>();
    if (!totalRewardData) return ids;
    for (const reward of totalRewardData) {
      if (reward.RequiredEventItemAmount > currentAmount && reward.RequiredEventItemAmount <= targetAmount) {
        ids.add(reward.Id);
      }
    }
    return ids;
  }, [totalRewardData, currentAmount, targetAmount]);

  useEffect(() => {
    if (!totalRewardData) {
      onCalculate(null);
      return;
    }

    // 1. Compensation calculation to be obtained
    const rewards: Record<string, number> = {};
    claimedRewardIds.forEach((rewardId) => {
      const rewardInfo = totalRewardData.find((r) => r.Id === rewardId);
      if (rewardInfo) {
        rewardInfo.RewardParcelId.forEach((id, index) => {
          const key = `${rewardInfo.RewardParcelTypeStr[index]}_${id}`;
          rewards[key] = (rewards[key] || 0) + rewardInfo.RewardParcelAmount[index];
        });
      }
    });

    // Calculate the amount of goods (demand) needed to achieve the goal
    let cost: { key: string; amount: number } | null = null;
    const neededAmount = targetAmount - currentAmount;
    if (neededAmount > 0 && requiredItemId) {
      cost = {
        key: `Item_${requiredItemId}`,
        amount: neededAmount,
      };
    }

    // Call onCalculate only when there is compensation or demand
    if (Object.keys(rewards).length > 0 || (cost && cost.amount > 0)) {
      onCalculate({ rewards, cost });
    } else {
      onCalculate(null);
    }
  }, [claimedRewardIds, totalRewardData, onCalculate, currentAmount, targetAmount, requiredItemId]);

  const handleSetMaxTarget = () => {
    if (!totalRewardData) return;
    const maxAmount = Math.max(...totalRewardData.map((r) => r.RequiredEventItemAmount));
    setTargetAmount(maxAmount);
  };

  if (!totalRewardData || !requiredItemId) return null;

  return (
    <div className="bg-white dark:bg-neutral-900 p-4 rounded-lg shadow-sm">
      <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h2>
        <span className="text-2xl text-gray-900 dark:text-white">
          <ChevronIcon className={isCollapsed ? 'rotate-180' : ''} />
        </span>
      </div>
      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          <div className="p-3 bg-yellow-50 dark:bg-neutral-800 rounded-lg grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold flex items-center gap-1 text-gray-800 dark:text-neutral-200">
                <ItemIcon type="Item" itemId={String(requiredItemId)} amount={0} size={6} eventData={eventData} iconData={iconData} />
                {t('currentLabel')}
              </label>
              <input
                type="number"
                value={currentAmount || ''}
                onChange={(e) => setCurrentAmount(parseInt(e.target.value) || 0)}
                className="w-full p-2 mt-1 text-lg rounded border bg-white dark:bg-neutral-700 border-gray-300 dark:border-neutral-600 text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-bold flex items-center gap-1 text-gray-800 dark:text-neutral-200">
                <ItemIcon type="Item" itemId={String(requiredItemId)} amount={0} size={6} eventData={eventData} iconData={iconData} />
                {t('targetLabel')}
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={targetAmount || ''}
                  onChange={(e) => setTargetAmount(parseInt(e.target.value) || 0)}
                  className="w-full p-2 text-lg rounded border bg-white dark:bg-neutral-700 border-gray-300 dark:border-neutral-600 text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500"
                  placeholder="0"
                />
                <button onClick={handleSetMaxTarget} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg shrink-0">
                  {t('maxButton')}
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
            {totalRewardData.map((reward) => {
              const isClaimed = claimedRewardIds.has(reward.Id);
              return (
                <div key={reward.Id} className={`p-2 rounded-lg flex items-center justify-between transition-opacity ${isClaimed ? 'bg-green-100 dark:bg-green-900/50' : 'opacity-80'}`}>
                  <div className="text-sm font-semibold text-gray-800 dark:text-neutral-200 flex items-center gap-2">
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center ${isClaimed ? 'bg-green-500 text-white' : 'border-2 bg-white dark:bg-neutral-700 border-gray-300 dark:border-neutral-600'}`}
                    >
                      {isClaimed && '✔'}
                    </div>
                    <span>
                      {t('requiredAmountSuffix', {
                        amount: reward.RequiredEventItemAmount.toLocaleString(),
                      })}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {reward.RewardParcelId.map((id, index) => (
                      <ItemIcon
                        key={index}
                        type={reward.RewardParcelTypeStr[index]}
                        itemId={String(id)}
                        amount={reward.RewardParcelAmount[index]}
                        size={10}
                        eventData={eventData}
                        iconData={iconData}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
