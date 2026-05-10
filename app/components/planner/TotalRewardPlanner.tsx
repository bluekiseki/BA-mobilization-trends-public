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
    <>
      <div className="flex justify-between items-center cursor-pointer group" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h2>
        <span className="text-2xl transition-transform duration-300 group-hover:scale-110">
          <ChevronIcon className={isCollapsed ? 'rotate-180' : ''} />
        </span>
      </div>
      {!isCollapsed && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0 flex items-center gap-1">
                <ItemIcon type="Item" itemId={String(requiredItemId)} amount={0} size={5} eventData={eventData} iconData={iconData} />
                {t('currentLabel')}
              </label>
              <input
                type="number"
                value={currentAmount || ''}
                onChange={(e) => setCurrentAmount(parseInt(e.target.value) || 0)}
                className="w-full p-1 border rounded-md text-sm bg-transparent dark:border-neutral-600 dark:text-gray-200"
                placeholder="0"
              />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0 flex items-center gap-1">
                <ItemIcon type="Item" itemId={String(requiredItemId)} amount={0} size={5} eventData={eventData} iconData={iconData} />
                {t('targetLabel')}
              </label>
              <input
                type="number"
                value={targetAmount || ''}
                onChange={(e) => setTargetAmount(parseInt(e.target.value) || 0)}
                className="w-full p-1 border rounded-md text-sm bg-transparent dark:border-neutral-600 dark:text-gray-200"
                placeholder="0"
              />
              <button onClick={handleSetMaxTarget} className="bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white text-xs font-bold py-1 px-3 rounded-md shrink-0">
                {t('maxButton')}
              </button>
            </div>
          </div>
          <div className="divide-y dark:divide-neutral-700">
            {totalRewardData.map((reward) => {
              const isClaimed = claimedRewardIds.has(reward.Id);
              return (
                <div key={reward.Id} className={`py-2 px-1 flex items-center gap-3 ${false ? 'bg-green-50 dark:bg-green-900/30' : ''}`}>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className={`w-5 h-5 rounded flex items-center justify-center text-xs shrink-0 ${isClaimed ? 'bg-green-500 text-white' : 'border-2 border-gray-300 dark:border-neutral-600'}`}>
                      {isClaimed && '✔'}
                    </div>
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                      {t('requiredAmountSuffix', {
                        amount: reward.RequiredEventItemAmount.toLocaleString(),
                      })}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end ml-auto">
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
    </>
  );
};
