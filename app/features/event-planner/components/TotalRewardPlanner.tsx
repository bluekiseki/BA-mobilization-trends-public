import type { TotalRewardResult } from '~/features/event-planner/types';
import { useEffect, useMemo } from 'react';
import { ItemIcon } from '../../../components/item/Icon';
import type { EventData, IconData } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useTranslation } from 'react-i18next';
import { CustomNumberInput } from '../../../components/common/CustomInput';

interface TotalRewardPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onCalculate: (result: TotalRewardResult | null) => void;
}

export const TotalRewardPlanner = ({ eventId, eventData, iconData, onCalculate }: TotalRewardPlannerProps) => {
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
  const requiredItemId = useMemo(() => eventData.currency?.filter((v) => v.EventContentItemType == 0)[0]?.ItemUniqueId, [eventData.currency]);

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
  }, [claimedRewardIds, totalRewardData, currentAmount, targetAmount, requiredItemId]);

  const handleSetMaxTarget = () => {
    if (!totalRewardData) return;
    const maxAmount = Math.max(...totalRewardData.map((r) => r.RequiredEventItemAmount));
    setTargetAmount(maxAmount);
  };

  if (!totalRewardData || !requiredItemId) return null;

  const currentInputId = `total-reward-current-${eventId}`;
  const targetInputId = `total-reward-target-${eventId}`;

  return (
    <>
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title')}</h2>
      <div className="mt-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_4.25rem] sm:items-center sm:gap-x-2">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_4.25rem] gap-x-2 sm:contents">
            <label
              htmlFor={currentInputId}
              className="col-span-2 mb-1.5 flex items-center gap-1 text-sm font-semibold text-neutral-700 dark:text-neutral-300 sm:col-span-1 sm:mb-0 sm:whitespace-nowrap"
            >
              <ItemIcon type="Item" itemId={String(requiredItemId)} amount={0} size={5} eventData={eventData} iconData={iconData} />
              {t('currentLabel')}
            </label>
            <CustomNumberInput
              id={currentInputId}
              value={currentAmount}
              onChange={(value) => setCurrentAmount(value ?? 0)}
              min={0}
              className="h-9 min-w-0 rounded-md border border-neutral-300 bg-transparent px-3 text-sm text-neutral-900 focus:border-ba-btn-blue-dark dark:border-neutral-600 dark:text-neutral-200"
              placeholder="0"
            />
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_4.25rem] gap-x-2 sm:contents">
            <label
              htmlFor={targetInputId}
              className="col-span-2 mb-1.5 flex items-center gap-1 text-sm font-semibold text-neutral-700 dark:text-neutral-300 sm:col-span-1 sm:mb-0 sm:whitespace-nowrap"
            >
              <ItemIcon type="Item" itemId={String(requiredItemId)} amount={0} size={5} eventData={eventData} iconData={iconData} />
              {t('targetLabel')}
            </label>
            <CustomNumberInput
              id={targetInputId}
              value={targetAmount}
              onChange={(value) => setTargetAmount(value ?? 0)}
              min={0}
              className="h-9 min-w-0 rounded-md border border-neutral-300 bg-transparent px-3 text-sm text-neutral-900 focus:border-ba-btn-blue-dark dark:border-neutral-600 dark:text-neutral-200"
              placeholder="0"
            />
            <button type="button" onClick={handleSetMaxTarget} className="h-9 rounded-md bg-ba-btn-yellow px-3 text-xs font-bold text-black hover:brightness-105 active:brightness-95">
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
                  <div className={`w-5 h-5 rounded flex items-center justify-center text-xs shrink-0 ${isClaimed ? 'bg-green-500 text-white' : 'border-2 border-neutral-300 dark:border-neutral-600'}`}>
                    {isClaimed && '✔'}
                  </div>
                  <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                    {t('requiredAmountSuffix', {
                      amount: reward.RequiredEventItemAmount.toLocaleString(),
                    })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 justify-end ml-auto">
                  {reward.RewardParcelId.map((id, index) => (
                    <ItemIcon key={index} type={reward.RewardParcelTypeStr[index]} itemId={String(id)} amount={reward.RewardParcelAmount[index]} size={10} eventData={eventData} iconData={iconData} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
