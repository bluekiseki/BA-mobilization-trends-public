// src/components/ShopPlanner.tsx
import { useEffect, useMemo } from 'react';
import { ItemIcon } from './common/Icon';
import { NumberInput } from './common/NumberInput';
import { useCallback } from 'react';
import type { EventData, IconData, Stage } from '~/types/plannerData';
import { useEventSettings } from '~/store/planner/useSettingsStore';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import { getLocalizeEtcName } from './common/locale';
import { CustomCheckbox } from '../CustomCheckbox';

type ItemType = 'Furniture' | 'Credit' | 'ExpGrowth' | 'Material' | 'Favor' | 'Coin' | 'SecretStone' | 'Gem' | 'Equipment';

export type ShopResult = {
  costs: Record<string, number>;
  rewards: Record<string, number>;
};

const getShopItemType = (rewardType: string, rewardId: number, itemInfo: { ItemCategory?: number } | undefined): ItemType | null => {
  if (rewardType === 'Furniture') return 'Furniture';
  if (rewardType === 'Equipment') return 'Equipment';
  if (rewardType === 'Currency') {
    if (rewardId === 1) return 'Credit';
    if (rewardId === 3) return 'Gem';
  }
  if (itemInfo && typeof itemInfo.ItemCategory === 'number') {
    switch (itemInfo.ItemCategory) {
      case 0:
        return 'Coin';
      case 1:
        return 'ExpGrowth';
      case 2:
        return 'SecretStone';
      case 3:
        return 'Material';
      case 6:
        return 'Favor';
    }
  }
  return null;
};

interface ShopPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  allStages: (Stage & { type: 'stage' | 'story' | 'challenge' })[]; // Receiving stage data from FarmingPlanner
  totalBonus: Record<number, number>; // Receive bonus data from BonusSelector
  onCalculate: (result: ShopResult | null) => void;
}

export const ShopPlanner = ({ eventId, eventData, iconData, allStages, totalBonus, onCalculate }: ShopPlannerProps) => {
  const { shopActiveTab: activeTab, setShopActiveTab: setActiveTab, shopDisplayUnit: displayUnit, setShopDisplayUnit: setDisplayUnit } = useEventSettings(eventId);

  const { plan, setPurchaseCounts, setAlreadyPurchasedCounts } = usePlanForEvent(eventId);
  const { purchaseCounts, alreadyPurchasedCounts } = plan;

  const { t, i18n } = useTranslation('planner');
  const locale = i18n.language as Locale;

  useEffect(() => {
    if (!activeTab) {
      const categories = Object.keys(eventData.shop);
      setActiveTab(categories[0]);
    }
  }, [eventData.shop]);

  // 2. Highest efficiency AP cost calculation by event goods
  const currencyApCostMap = useMemo(() => {
    if (!allStages || !eventData) return {};

    const apMap: Record<number, number> = {};
    const eventCurrencyIds = new Set(eventData.currency.map((c) => c.ItemUniqueId));

    eventCurrencyIds.forEach((currencyId) => {
      let bestApPerItem = Infinity;

      // Find all the 'repeatable' stages that drop the goods.
      const stagesThatDropThis = allStages.filter((s) => s.StageEnterCostAmount == 20 && s.type === 'stage' && s.EventContentStageReward.some((r) => r.RewardId === currencyId));

      for (const stage of stagesThatDropThis) {
        const totalRewardSum = stage.EventContentStageReward.filter((r) => r.RewardTagStr == 'Event')
          .map((v) => v?.RewardAmount)
          .reduce((a, b) => a + b);
        const rewardInfo = stage.EventContentStageReward.find((r) => r.RewardId === currencyId && r.RewardTagStr == 'Event')!;
        if (!rewardInfo) continue;
        const baseDropAmount = (rewardInfo.RewardAmount * rewardInfo.RewardProb) / 10000;
        const bonusPercent = totalBonus[currencyId] || 0;
        const effectiveDropAmount = baseDropAmount * (1 + bonusPercent / 10000);

        if (effectiveDropAmount > 0) {
          const apPerItem = (stage.StageEnterCostAmount * (baseDropAmount / totalRewardSum)) / effectiveDropAmount;
          if (apPerItem < bestApPerItem) {
            bestApPerItem = apPerItem;
          }
        }
      }
      apMap[currencyId] = bestApPerItem === Infinity ? 0 : bestApPerItem;
    });
    return apMap;
  }, [allStages, eventData, totalBonus]);

  const handlePurchaseAllItems = () => {
    const newCounts: Record<number, number> = {};
    const allItems = Object.values(eventData.shop).flat();

    allItems.forEach((item) => {
      const alreadyPurchased = alreadyPurchasedCounts?.[item.Id] || 0;
      const remainingLimit = item.PurchaseCountLimit - alreadyPurchased;
      if (remainingLimit > 0) {
        newCounts[item.Id] = remainingLimit;
      }
    });

    setPurchaseCounts((prev) => ({ ...prev, ...newCounts }));
  };

  const handleResetAllPurchases = () => {
    setPurchaseCounts(() => ({}));
  };

  const handlePurchaseChange = (itemId: number, count: number, limit: number) => {
    const newCount = Math.max(0, Math.min(count, limit ? limit : count));
    setPurchaseCounts((prev) => ({ ...prev, [itemId]: newCount }));
  };

  const handleAlreadyPurchasedChange = useCallback(
    (itemId: number, count: number, limit: number) => {
      const newAlreadyPurchased = Math.max(0, Math.min(count, limit));

      // 1. Update 'previously purchased' quantity
      setAlreadyPurchasedCounts((prev) => ({
        ...prev,
        [itemId]: newAlreadyPurchased,
      }));

      // 2. Calculate new stock (remainingLimit)
      const newRemainingLimit = limit - newAlreadyPurchased;
      const currentPurchase = purchaseCounts?.[itemId] || 0;

      // 3. If the current 'purchase' quantity exceeds the new stock, automatically adjust it to the maximum stock
      if (currentPurchase > newRemainingLimit) {
        setPurchaseCounts((prev) => ({
          ...prev,
          [itemId]: newRemainingLimit,
        }));
      }
    },
    [purchaseCounts, setAlreadyPurchasedCounts, setPurchaseCounts],
  );

  const handleSelectAllInCategory = (categoryId: string) => {
    const newCounts: Record<number, number> = {};
    const itemsInCategory = eventData.shop[categoryId];

    itemsInCategory.forEach((item) => {
      const alreadyPurchased = alreadyPurchasedCounts?.[item.Id] || 0;
      const remainingLimit = item.PurchaseCountLimit - alreadyPurchased;
      if (remainingLimit > 0) {
        newCounts[item.Id] = remainingLimit;
      }
    });

    setPurchaseCounts((prev) => ({ ...prev, ...newCounts }));
  };

  const handleResetCategory = (categoryId: string) => {
    const newCounts = { ...purchaseCounts };
    const itemsInCategory = eventData.shop[categoryId];
    itemsInCategory.forEach((item) => {
      if (newCounts[item.Id]) {
        delete newCounts[item.Id];
      }
    });
    setPurchaseCounts((prev) => ({ ...newCounts }));
  };

  /*
    const handleSelectAllByTypeInCategory = (type: ItemType, categoryId: string) => {
      const newCounts = { ...purchaseCounts };
      const itemsInCategory = eventData.shop[categoryId];
  
      itemsInCategory.forEach(item => {
        if (!item.Goods?.length) return;
  
        const goodsInfo = item.Goods[0];
        const rewardId = goodsInfo.ParcelId[0];
        const rewardType = goodsInfo.ParcelTypeStr[0];
        const itemInfo = (eventData.icons as any)[rewardType]?.[rewardId.toString()];
  
        // Simplify logic by calling helper function
        const currentItemType = getShopItemType(rewardType, rewardId, itemInfo);
  
        if (currentItemType === type) {
          const alreadyPurchased = alreadyPurchasedCounts?.[item.Id] || 0;
          const remainingLimit = item.PurchaseCountLimit - alreadyPurchased;
          if (remainingLimit > 0) {
            newCounts[item.Id] = remainingLimit;
          }
        }
      });
      setPurchaseCounts(() => newCounts);
    };*/

  const handleToggleTypeSelection = (type: ItemType, categoryId: string, currentState: 'checked' | 'unchecked' | 'indeterminate') => {
    const isFullyChecked = currentState === 'checked';

    const newCounts = { ...purchaseCounts };
    const itemsInCategory = eventData.shop[categoryId];

    itemsInCategory.forEach((item) => {
      if (!item.Goods?.length) return;

      const goodsInfo = item.Goods[0];
      const rewardId = goodsInfo.ParcelId[0];
      const rewardType = goodsInfo.ParcelTypeStr[0];
      const itemInfo = (eventData.icons as any)[rewardType]?.[rewardId.toString()];
      const currentItemType = getShopItemType(rewardType, rewardId, itemInfo);

      if (currentItemType === type) {
        const alreadyPurchased = alreadyPurchasedCounts?.[item.Id] || 0;
        const isInfinite = item.PurchaseCountLimit === 0;
        // Target only non-infinite purchase items
        if (!isInfinite) {
          const remainingLimit = item.PurchaseCountLimit - alreadyPurchased;
          if (remainingLimit > 0) {
            if (isFullyChecked) {
              // Clicked while already fully selected -> Deselect all (set to 0)
              newCounts[item.Id] = 0;
            } else {
              // Clicked while unselected or partially selected -> Select all (set to remaining stock)
              newCounts[item.Id] = remainingLimit;
            }
          }
        }
      }
    });
    setPurchaseCounts(() => newCounts);
  };

  const itemTypeButtons = [
    { label: t('item.reports'), type: 'ExpGrowth' as const },
    { label: t('label.material'), type: 'Material' as const },
    { label: t('item.gifts'), type: 'Favor' as const },
    { label: t('label.furniture'), type: 'Furniture' as const },
    { label: t('common.credits'), type: 'Credit' as const },
    { label: t('label.coin'), type: 'Coin' as const },
    { label: t('item.eleph'), type: 'SecretStone' as const },
    { label: t('common.pyroxene'), type: 'Gem' as const },
    { label: t('item.equipment'), type: 'Equipment' as const },
  ];

  const categorySelectionStates = useMemo(() => {
    if (!activeTab) return {};

    const itemsInCategory = eventData.shop[activeTab] || [];
    // { ExpGrowth: { totalEligible: 5, totalSelected: 2 }, ... }
    const states: Record<string, { totalEligible: number; totalSelected: number }> = {};

    // 1. Initialize state object for all button types
    itemTypeButtons.forEach((btn) => {
      states[btn.type] = { totalEligible: 0, totalSelected: 0 };
    });

    // 2. Iterate through current category items and calculate state
    for (const item of itemsInCategory) {
      if (!item.Goods?.length) continue;

      const goodsInfo = item.Goods[0];
      const rewardId = goodsInfo.ParcelId[0];
      const rewardType = goodsInfo.ParcelTypeStr[0];
      const itemInfo = (eventData.icons as any)[rewardType]?.[rewardId.toString()];
      const itemType = getShopItemType(rewardType, rewardId, itemInfo);

      // Count only purchasable items that are not infinite purchase
      if (itemType && states[itemType]) {
        const alreadyPurchased = alreadyPurchasedCounts?.[item.Id] || 0;
        const isInfinite = item.PurchaseCountLimit === 0;
        const remainingLimit = isInfinite ? Infinity : item.PurchaseCountLimit - alreadyPurchased;

        // Items subject to 'Select All' (Non-infinite, in stock)
        if (!isInfinite && remainingLimit > 0) {
          states[itemType].totalEligible++;

          const currentPurchase = purchaseCounts?.[item.Id] || 0;
          if (currentPurchase === remainingLimit) {
            states[itemType].totalSelected++;
          }
        }
      }
    }
    return states;
  }, [activeTab, eventData.shop, purchaseCounts, alreadyPurchasedCounts, itemTypeButtons]);

  const shopCategories = useMemo(() => Object.entries(eventData.shop), [eventData.shop]);

  const apConversionNotice = useMemo(() => {
    if (displayUnit !== 'ap' || !activeTab) return null;

    const itemsInCurrentCategory = eventData.shop[activeTab] || [];

    let hasReports = false;
    let hasEnhancementStones = false;

    for (const item of itemsInCurrentCategory) {
      if (item.Goods) {
        const goodsInfo = item.Goods[0];
        const rewardId = goodsInfo.ParcelId[0];
        const rewardType = goodsInfo.ParcelTypeStr[0];
        const itemInfo = (eventData.icons as any)[rewardType]?.[rewardId.toString()];

        // Simplify logic by calling helper function
        const currentItemType = getShopItemType(rewardType, rewardId, itemInfo);
        if (currentItemType == 'Equipment') hasEnhancementStones = true;
        else if (currentItemType == 'ExpGrowth') hasReports = true;
      }
    }

    return (
      <div className="space-y-2">
        {/* 1. Basic informational text (always displayed) */}
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('ui.defaultNotice')}</p>

        {/* 2. Statement related to the report  */}
        {hasReports && (
          <div className="text-xs text-orange-700 dark:text-orange-400 border-t border-orange-200 dark:border-orange-800 pt-2 mt-2">
            <p>
              <strong>{t('ui.reportNoticeTitle')}</strong>
            </p>
            <p className="font-mono text-[10px] opacity-80">{t('ui.reportNoticeFormula')}</p>
          </div>
        )}

        {/* 3. a phrase related to EnhancementStones */}
        {hasEnhancementStones && (
          <div className="text-xs text-orange-700 dark:text-orange-400 border-t border-orange-200 dark:border-orange-800 pt-2 mt-2">
            <p>
              <strong>{t('ui.enhancementStoneNoticeTitle')}</strong>
            </p>
            <p className="font-mono text-[10px] opacity-80">{t('ui.enhancementStoneNoticeFormula')}</p>
          </div>
        )}
      </div>
    );
  }, [displayUnit, activeTab, eventData, locale]);

  return (
    <>
      <div data-component-name="ShopPlanner" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 shrink-0">{t('page.eventShop')}</h2>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-sm font-semibold text-gray-600 dark:text-gray-300">
            <input type="checkbox" className="h-4 w-4 rounded" checked={displayUnit === 'ap'} onChange={(e) => setDisplayUnit(e.target.checked ? 'ap' : 'currency')} />
            {t('ui.displayCostInAP')}
          </label>

          <div className="flex items-center gap-2">
            <button onClick={handlePurchaseAllItems} className="bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-bold text-xs py-1 px-3 rounded-lg">
              {t('button.purchaseAllItems')}
            </button>
            <button onClick={handleResetAllPurchases} className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white font-bold text-xs py-1 px-3 rounded-lg">
              {t('button.resetAll')}
            </button>
          </div>
        </div>
      </div>

      {/*Tab navigation UI */}
      <div className="flex flex-wrap border-b-2 border-gray-200 dark:border-neutral-700 mb-4 pb-4">
        {shopCategories.map(([categoryId]) => {
          const shopInfo = eventData.shop_info?.find((info) => info.CategoryType.toString() === categoryId);
          const currencyId = shopInfo?.CostParcelId[0];

          const currencyName = currencyId
            ? getLocalizeEtcName(eventData.icons.Item[currencyId]?.LocalizeEtc, locale) ||
              getLocalizeEtcName(eventData.icons.Item[currencyId]?.LocalizeEtc, 'ja') ||
              getLocalizeEtcName(eventData.icons.Currency[currencyId]?.LocalizeEtc, locale)
            : `Shop ${categoryId}`;
          return (
            <button
              key={categoryId}
              onClick={() => setActiveTab(categoryId)}
              className={`flex items-center space-x-2 px-3 pt-4 text-sm font-semibold border-b-2 -mb-0.5 ${
                activeTab === categoryId
                  ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <span>
                <img
                  src={`data:image/webp;base64,${iconData.Item?.[currencyId?.toString() ?? ''] || iconData.Currency?.[currencyId?.toString() ?? '']}`}
                  alt={currencyName || undefined}
                  className="w-6 h-6 object-cover rounded-full"
                />
              </span>
              <span>{currencyName}</span>
            </button>
          );
        })}
      </div>

      {displayUnit === 'ap' && (
        <div data-component-name="ShopPlanner_apbanner" className="p-2 mb-4 bg-orange-50 dark:bg-orange-900/40 rounded-md border border-orange-200 dark:border-orange-800">
          {apConversionNotice}
        </div>
      )}

      <div className="space-y-6">
        {shopCategories.map(([categoryId, items]) => {
          console.log('shop - activeTab', activeTab);
          if (activeTab !== categoryId) return null; // Render only the active tab

          // Find shop name using shop_info
          // const shopInfo = eventData.shop_info?.find(info => info.CategoryType.toString() === categoryId);
          // const currencyId = shopInfo?.CostParcelId[0];
          // const currencyName = currencyId ? eventData.icons.Item[currencyId]?.LocalizeEtc?.NameKr : `Shop ${categoryId}`;

          const availableTypesInCategory = new Set<string>();
          items.forEach((item) => {
            if (!item.Goods?.length) return;
            const goodsInfo = item.Goods[0];
            const rewardId = goodsInfo.ParcelId[0];
            const rewardType = goodsInfo.ParcelTypeStr[0];
            const itemInfo = (eventData.icons as any)[rewardType]?.[rewardId.toString()];

            const itemType = getShopItemType(rewardType, rewardId, itemInfo);
            if (itemType) {
              availableTypesInCategory.add(itemType);
            }
          });

          const filteredButtons = itemTypeButtons.filter((btn) => availableTypesInCategory.has(btn.type));

          return (
            <div key={categoryId}>
              <div className="flex justify-between items-center mb-3">
                <div className="flex flex-wrap gap-2">
                  {filteredButtons
                    .filter((btn) => categorySelectionStates[btn.type].totalEligible)
                    .map((btn) => {
                      const stateInfo = categorySelectionStates[btn.type];
                      if (!stateInfo) return null;

                      const { totalEligible, totalSelected } = stateInfo;
                      const isDisabled = totalEligible === 0;

                      let state: 'checked' | 'unchecked' | 'indeterminate' = 'unchecked';
                      if (!isDisabled) {
                        if (totalSelected === totalEligible) {
                          state = 'checked';
                        } else if (totalSelected > 0) {
                          state = 'indeterminate';
                        }
                      }
                      return (
                        <label
                          key={btn.type}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors
                          ${isDisabled ? 'bg-gray-200 dark:bg-neutral-800 text-gray-400 dark:text-neutral-600 cursor-not-allowed' : 'bg-teal-500/10 dark:bg-teal-600/20 text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 dark:hover:bg-teal-600/30 cursor-pointer'}`}
                        >
                          <CustomCheckbox
                            state={state}
                            disabled={isDisabled}
                            // OnChange only causes click events.
                            // Checked status changes are handled by useEffect inside CustomCheckbox seeing 'state' prop.
                            onChange={() => {
                              if (!isDisabled) {
                                handleToggleTypeSelection(btn.type, categoryId, state);
                              }
                            }}
                          />
                          <span>{btn.label}</span>
                        </label>
                      );
                    })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSelectAllInCategory(categoryId)}
                    className="bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white font-bold text-xs py-1 px-2 rounded-md"
                  >
                    {' '}
                    {t('button.purchaseCurrentTab')}
                  </button>
                  <button
                    onClick={() => handleResetCategory(categoryId)}
                    className="bg-gray-400 hover:bg-gray-500 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white font-bold text-xs py-1 px-2 rounded-md"
                  >
                    {t('button.resetCurrentTab')}
                  </button>
                </div>
              </div>

              <div data-component-name="ShopPlanner_goodsStand" className="flex flex-wrap gap-2 justify-center">
                {items.map((item) => {
                  if (!item.Goods?.length) return null;
                  const goodsInfo = item.Goods[0];
                  const rewardId = goodsInfo.ParcelId[0];
                  const rewardType = goodsInfo.ParcelTypeStr[0] as keyof IconData;
                  // const cost = goodsInfo.ConsumeParcelAmount[0];
                  const alreadyPurchased = alreadyPurchasedCounts?.[item.Id] || 0;
                  const currentPurchase = purchaseCounts?.[item.Id] || 0;
                  const isInfinite = item.PurchaseCountLimit === 0;
                  const remainingLimit = isInfinite ? Infinity : item.PurchaseCountLimit - alreadyPurchased;
                  const displayLimit = isInfinite ? '∞' : item.PurchaseCountLimit - alreadyPurchased;

                  const costAmount = goodsInfo.ConsumeParcelAmount[0];
                  const costCurrencyId = goodsInfo.ConsumeParcelId[0];
                  const apCostPerItem = currencyApCostMap[costCurrencyId] || null;
                  const totalApCost = apCostPerItem ? costAmount * apCostPerItem : null;

                  return (
                    <div key={item.Id} className="w-[calc(25%-6px)] sm:w-24 bg-gray-100 dark:bg-neutral-700/60 p-1 rounded-sm shadow-sm flex flex-col justify-between">
                      <div className="flex justify-center">
                        <ItemIcon type={rewardType} itemId={rewardId.toString()} amount={goodsInfo.ParcelAmount[0]} size={12} eventData={eventData} iconData={iconData} />
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center justify-center mt-0.5">
                        <span
                          className="inline-flex items-center
                          bg-no-repeat bg-bottom
                          bg-[linear-gradient(to_top,currentColor_1px,transparent_1px)]
                          bg-size-[100%_1px]"
                        >
                          {displayUnit === 'ap' ? (
                            <>
                              <span className="font-bold text-teal-600 dark:text-teal-400">{totalApCost ? totalApCost.toPrecision(3) : 'NA'}</span>
                              <img src={`data:image/webp;base64,${iconData.Currency?.['5']}`} className="w-3 h-3 ml-0.5 object-cover rounded-full" />
                              {/* <span className="ml-0.5">AP</span> */}
                            </>
                          ) : (
                            <>
                              <span>{costAmount.toLocaleString()}</span>
                              <img src={`data:image/webp;base64,${iconData.Item?.[costCurrencyId.toString()]}`} className="w-3 h-3 ml-0.5 object-cover rounded-full" />
                            </>
                          )}
                        </span>
                        {/* <span className="hidden sm:block mx-1">|</span> */}
                        {/* <span>{t('ui.stock')} {displayLimit}</span> */}
                        <span>&times; {displayLimit}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div>
                          <label className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">{t('ui.alreadyPurchased')}</label>
                          <NumberInput
                            value={alreadyPurchased}
                            onChange={(val) => handleAlreadyPurchasedChange(item.Id, val, item.PurchaseCountLimit)}
                            min={0}
                            max={isInfinite ? Infinity : item.PurchaseCountLimit}
                            disabled={isInfinite}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">{t('ui.purchase')}</label>
                          <NumberInput
                            value={currentPurchase}
                            onChange={(val) => handlePurchaseChange(item.Id, val, remainingLimit)}
                            min={0}
                            max={isInfinite ? Infinity : remainingLimit}
                            disabled={remainingLimit <= 0 && !isInfinite}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
