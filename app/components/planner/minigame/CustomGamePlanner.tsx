import { useState, useEffect, useMemo } from 'react';
import { ItemIcon } from '../common/Icon';
import type { EventData, IconData, IconInfos } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useTranslation } from 'react-i18next';
import { ChevronIcon } from '~/components/Icon';
import type { Locale } from '~/utils/i18n/config';
import { getLocalizeEtcName } from '../common/locale';

export type CustomGameResult = {
  cost: { key: string; amount: number } | null;
  rewards: Record<string, number>;
};

interface CustomGamePlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onCalculate: (result: CustomGameResult | null) => void;
  remainingCurrency: Record<number, number>;
}

export interface CustomGameItem {
  type: string;
  id: string;
  amount: number;
}

type CustomGameSelectorType = 'cost' | 'reward' | 'oneTimeReward';
export interface CustomGameSelecting {
  type: CustomGameSelectorType;
  index?: number;
}

export const CustomGamePlanner = ({ eventId, eventData, iconData, onCalculate, remainingCurrency }: CustomGamePlannerProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [isSelecting, setIsSelecting] = useState<{
    type: 'cost' | 'reward' | 'oneTimeReward';
    index?: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { plan, setCustomGameCost: setCost, setCustomGameRewards: setRewards, setCustomGameOneTimeRewards: setOneTimeRewards, setCustomGamePlays: setPlays } = usePlanForEvent(eventId);

  const { customGamePlays: plays, customGameCost: cost, customGameRewards: rewards, customGameOneTimeRewards: oneTimeRewards } = plan;

  const { t } = useTranslation('planner');
  const { t: t_c, i18n } = useTranslation('common');
  const locale = i18n.language as Locale;

  if (plays === undefined || cost === undefined || rewards === undefined || oneTimeRewards === undefined) {
    return null;
  }

  const farmingItemsForCost = useMemo(() => {
    const farmingItemIds = new Set<number>();
    const allEventStages = eventData?.stage?.stage || [];

    for (const stage of allEventStages) {
      for (const r of stage.EventContentStageReward) {
        // Filter only rewards with tag 'Event', not GachaGroup or Current type
        if (['GachaGroup', 'Currency'].includes(r.RewardParcelTypeStr[0])) continue;
        if (r.RewardTagStr !== 'Event') continue;
        farmingItemIds.add(r.RewardId);
      }
    }

    return Array.from(farmingItemIds).map((id) => ({
      type: 'Item', // Farming goods are always "Item" type
      id: id.toString(),
    }));
  }, [eventData]);
  // Logic to set to default when there is one farmable good
  useEffect(() => {
    if (farmingItemsForCost.length === 1 && !cost) {
      setCost({
        type: farmingItemsForCost[0].type,
        id: farmingItemsForCost[0].id,
        amount: 1,
      });
    }
  }, [farmingItemsForCost, cost]);

  const allItems = useMemo(() => {
    const items: { type: string; id: string }[] = [];
    if (eventData.icons) {
      for (const type in eventData.icons) {
        for (const id in (eventData.icons as any)[type]) {
          items.push({ type, id });
        }
      }
    }
    return items;
  }, [eventData]);

  const eventItemKeySet = useMemo(() => {
    const keys = new Set<string>();
    if (!eventData) return keys;

    // event goods
    eventData.currency?.forEach((c) => keys.add(`Item_${c.ItemUniqueId}`));

    // Shop item (consumable goods + acquired items)
    Object.values(eventData.shop || {})
      .flat()
      .forEach((item) => {
        item.Goods?.forEach((good) => {
          good.ConsumeParcelId.forEach((id, i) => keys.add(`${good.ConsumeParcelTypeStr[i]}_${id}`));
          good.ParcelId.forEach((id, i) => keys.add(`${good.ParcelTypeStr[i]}_${id}`));
        });
      });

    // Stage Rewards
    ['stage', 'story', 'challenge'].forEach((type) => {
      eventData.stage?.[type as keyof typeof eventData.stage]?.forEach((s) => {
        s.EventContentStageReward.forEach((r) => keys.add(`${r.RewardParcelTypeStr}_${r.RewardId}`));
      });
    });

    // mission Rewards
    eventData.mission?.forEach((m) => {
      m.MissionRewardParcelId.forEach((id, i) => keys.add(`${m.MissionRewardParcelTypeStr[i]}_${id}`));
    });

    // Other mini-games rewards
    eventData.card_shop?.forEach((c) => c.RewardParcelId.forEach((id, i) => keys.add(`${c.RewardParcelTypeStr[i]}_${id}`)));
    eventData.total_reward?.forEach((r) => r.RewardParcelId.forEach((id, i) => keys.add(`${r.RewardParcelTypeStr[i]}_${id}`)));

    return keys;
  }, [eventData]);

  // 3. Logic to prioritize event-related items
  const prioritizedItems = useMemo(() => {
    return [...allItems].sort((a, b) => {
      const keyA = `${a.type}_${a.id}`;
      const keyB = `${b.type}_${b.id}`;
      const isAEvent = eventItemKeySet.has(keyA);
      const isBEvent = eventItemKeySet.has(keyB);

      if (isAEvent && !isBEvent) return -1; //If A is an event item, go to the front
      if (!isAEvent && isBEvent) return 1; // If B is an event item, go to the front
      return 0; // Either it's an event item or keep the order
    });
  }, [allItems, eventItemKeySet]);

  const displayedItems = useMemo(() => {
    const baseList = isSelecting?.type === 'cost' ? farmingItemsForCost : prioritizedItems;
    if (!searchQuery.trim()) {
      return baseList;
    }
    const lowerCaseQuery = searchQuery.toLowerCase();
    return baseList.filter((item) => {
      const data = eventData?.icons?.[item.type as keyof IconInfos]?.[item.id];
      const nameData = data && ('LocalizeEtc' in data ? data.LocalizeEtc : undefined);

      const name = getLocalizeEtcName(nameData, locale) || '';
      return name.toLowerCase().includes(lowerCaseQuery);
    });
  }, [isSelecting, searchQuery, farmingItemsForCost, prioritizedItems, iconData, locale]);

  const handleItemSelect = (item: { type: string; id: string }) => {
    if (!isSelecting) return;
    if (isSelecting.type === 'cost') {
      setCost(
        ((prev) => ({
          ...(prev || { amount: 1 }),
          type: item.type,
          id: item.id,
        }))(cost),
      );
    } else if (isSelecting.type === 'reward') {
      setRewards(
        ((prev) => {
          const newRewards = [...prev];
          if (isSelecting.index !== undefined && newRewards[isSelecting.index]) {
            newRewards[isSelecting.index] = {
              ...newRewards[isSelecting.index],
              type: item.type,
              id: item.id,
            };
          } else {
            newRewards.push({ type: item.type, id: item.id, amount: 1 });
          }
          return newRewards;
        })(rewards),
      );
    } else if (isSelecting.type === 'oneTimeReward') {
      setOneTimeRewards(((prev) => [...prev, { type: item.type, id: item.id, amount: 1 }])(oneTimeRewards));
    }
    setIsSelecting(null);
  };

  const handleSetMaxPlays = () => {
    if (!cost || rewards.length === 0) return;
    let maxRequiredPlays = 0;
    for (let [itemIdStr, deficit] of Object.entries(remainingCurrency)) {
      const neededItemId = Number(itemIdStr);
      const rewardInfo = rewards.find((r) => r.type === 'Item' && Number(r.id) === neededItemId);
      if (rewardInfo) deficit -= rewardInfo.amount * plays;
      if (deficit < 0) {
        if (rewardInfo && rewardInfo.amount > 0) {
          const required = Math.ceil(-deficit / rewardInfo.amount);
          if (required > maxRequiredPlays) maxRequiredPlays = required;
        }
      }
    }
    setPlays(maxRequiredPlays);
  };

  useEffect(() => {
    if (!cost || cost.amount <= 0 || plays < 0) {
      onCalculate(null);
      return;
    }
    const totalRewards: Record<string, number> = {};
    if (plays > 0) {
      for (const reward of rewards) {
        if (reward.amount > 0) {
          const key = `${reward.type}_${reward.id}`;
          totalRewards[key] = (totalRewards[key] || 0) + reward.amount * plays;
        }
      }
    }
    for (const reward of oneTimeRewards) {
      if (reward.amount > 0) {
        const key = `${reward.type}_${reward.id}`;
        totalRewards[key] = (totalRewards[key] || 0) + reward.amount;
      }
    }
    onCalculate({
      cost: { key: `${cost.type}_${cost.id}`, amount: cost.amount * plays },
      rewards: totalRewards,
    });
  }, [cost, rewards, oneTimeRewards, plays, onCalculate]);

  const handleCloseModal = () => {
    setIsSelecting(null);
    setSearchQuery('');
  };

  return (
    <>
      <div className="flex justify-between items-center cursor-pointer group" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('customGamePlanner.title')}</h2>
        <span className="text-2xl transition-transform duration-300 group-hover:scale-110">
          <ChevronIcon className={isCollapsed ? 'rotate-180' : ''} />
        </span>
      </div>
      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-neutral-800/50 rounded-lg space-y-3">
            <div>
              <label className="text-sm font-bold dark:text-gray-300">{t('customGamePlanner.setCostPerExchange')}</label>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => setIsSelecting({ type: 'cost' })}
                  className="w-16 h-16 bg-white dark:bg-neutral-700 border-2 border-dashed dark:border-neutral-600 rounded-md flex items-center justify-center"
                >
                  {cost ? (
                    <ItemIcon type={cost.type} itemId={cost.id} amount={0} size={10} eventData={eventData} iconData={iconData} />
                  ) : (
                    <span className="text-2xl text-gray-400 dark:text-gray-500">+</span>
                  )}
                </button>
                <input
                  type="number"
                  step="any"
                  placeholder={t('customGamePlanner.amountPlaceholder')}
                  value={cost?.amount || ''}
                  onChange={(e) => setCost(((c) => (c ? { ...c, amount: parseFloat(e.target.value) || 0 } : null))(cost))}
                  className="w-full p-2 text-lg rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-bold dark:text-gray-300">{t('customGamePlanner.setRewardPerExchange')}</label>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {rewards.map((reward, index) => (
                  <div key={index} className="flex items-center gap-1 p-1 bg-white border rounded-md">
                    <ItemIcon type={reward.type} itemId={reward.id} amount={0} size={10} eventData={eventData} iconData={iconData} />
                    <input
                      type="number"
                      step="any"
                      placeholder={t('customGamePlanner.amountPlaceholder')}
                      value={reward.amount}
                      onChange={(e) =>
                        setRewards(
                          ((r) => {
                            const nr = [...r];
                            nr[index].amount = parseFloat(e.target.value) || 0;
                            return nr;
                          })(rewards),
                        )
                      }
                      className="w-16 p-1 text-sm rounded border"
                    />
                    <button onClick={() => setRewards(((r) => r.filter((_, i) => i !== index))(rewards))} className="text-red-500 font-bold text-lg">
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setIsSelecting({ type: 'reward' })}
                  className="w-12 h-12 bg-white dark:bg-neutral-700 border-2 border-dashed dark:border-neutral-600 rounded-md flex items-center justify-center text-2xl text-gray-400 dark:text-gray-500"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-bold">{t('ui.oneTimeReward')}</label>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {oneTimeRewards.map((reward, index) => (
                  <div key={index} className="flex items-center gap-1 p-1 bg-white dark:bg-neutral-700/50 border dark:border-neutral-600 rounded-md">
                    <ItemIcon type={reward.type} itemId={reward.id} amount={0} size={10} eventData={eventData} iconData={iconData} />

                    <input
                      type="number"
                      step="any"
                      placeholder={t('customGamePlanner.amountPlaceholder')}
                      value={reward.amount}
                      onChange={(e) =>
                        setOneTimeRewards(
                          ((r) => {
                            const nr = [...r];
                            nr[index].amount = parseFloat(e.target.value) || 0;
                            return nr;
                          })(oneTimeRewards),
                        )
                      }
                      className="w-16 p-1 text-sm rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
                    />
                    <button onClick={() => setOneTimeRewards(((r) => r.filter((_, i) => i !== index))(oneTimeRewards))} className="text-red-500 font-bold text-lg">
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setIsSelecting({ type: 'oneTimeReward' })}
                  className="w-12 h-12 bg-white dark:bg-neutral-700 border-2 border-dashed dark:border-neutral-600 rounded-md flex items-center justify-center text-2xl text-gray-400 dark:text-gray-500"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/40 rounded-lg">
            <h3 className="font-bold text-sm mb-2 dark:text-yellow-200">{t('customGamePlanner.planSettingsTotalExchanges')}</h3>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder={t('customGamePlanner.exchangeCountPlaceholder')}
                value={plays || ''}
                onChange={(e) => setPlays(parseInt(e.target.value) || 0)}
                className="w-full p-2 text-lg rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
              />
              <button onClick={handleSetMaxPlays} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg shrink-0">
                {t('customGamePlanner.setToMax')}
              </button>
            </div>
          </div>
        </div>
      )}
      {isSelecting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-51 p-4">
          <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg w-full max-w-2xl flex flex-col">
            <h3 className="font-bold text-lg mb-2 dark:text-gray-100">{isSelecting.type === 'cost' ? t('ui.selectCostItem') : t('ui.selectRewardItemAll')}</h3>

            {/* Search input window */}
            <input
              type="text"
              placeholder={t('ui.searchItem')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-2 mb-2 border rounded-md bg-transparent dark:border-neutral-600 dark:text-gray-200"
              autoFocus
            />

            {/* Rendering sorted and filtered displayedItems */}
            <div className="flex flex-wrap gap-2 max-h-96 overflow-y-auto border dark:border-neutral-700 p-2 rounded-md">
              {displayedItems.map((item) => (
                <div key={`${item.type}_${item.id}`} onClick={() => handleItemSelect(item)} className="cursor-pointer">
                  <ItemIcon type={item.type} itemId={item.id} amount={0} size={10} eventData={eventData} iconData={iconData} />
                </div>
              ))}
              {displayedItems.length === 0 && <div className="w-full text-center text-gray-500 py-4">{t('ui.searchNoResult')}</div>}
            </div>
            <button onClick={handleCloseModal} className="w-full mt-4 bg-gray-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 py-2 rounded-md">
              {t_c('close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
