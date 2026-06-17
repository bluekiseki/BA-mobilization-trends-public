// src/components/ShopPlanner.tsx
import { useCallback, useEffect, useMemo } from 'react';
import { ItemIcon } from './common/Icon';
import { NumberInput } from './common/NumberInput';
import type { EventData, GachaGroupInfo, IconData, IconInfo, Stage, StudentData, StudentPortraitData } from '~/types/plannerData';
import { useEventSettings } from '~/store/planner/useSettingsStore';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import { getLocalizeEtcName } from './common/locale';
import { CustomCheckbox } from '../CustomCheckbox';
import { getCurrentTierPrice } from './common/shopTieredCost';

type ItemType = 'Furniture' | 'Credit' | 'ExpGrowth' | 'Material' | 'Favor' | 'Coin' | 'SecretStone' | 'Gem' | 'Equipment' | 'Opart' | 'TacticalBD' | 'TechNote';

export type ShopResult = {
  costs: Record<string, number>;
  rewards: Record<string, number>;
};

const getShopItemType = (rewardType: string, rewardId: number, itemInfo?: IconInfo | GachaGroupInfo): ItemType | null => {
  if (itemInfo && !('ItemCategory' in itemInfo)) return 'Equipment'; // Temporary

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
        if (rewardId >= 100 && rewardId <= 299) return 'Opart';
        if (rewardId >= 3000 && rewardId <= 3999) return 'TacticalBD';
        if (rewardId >= 4000 && rewardId <= 4999) return 'TechNote';
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
  shop: NonNullable<EventData['shop']>;
  iconData: IconData;
  allStages: (Stage & { type: 'stage' | 'story' | 'challenge' })[]; // Receiving stage data from FarmingPlanner
  totalBonus: Record<number, number>; // Receive bonus data from BonusSelector
  allStudents?: StudentData;
  studentPortraits?: StudentPortraitData;
}

export const ShopPlanner = ({ eventId, shop, eventData, iconData, allStages, totalBonus, allStudents, studentPortraits }: ShopPlannerProps) => {
  const { shopActiveTab: activeTab, setShopActiveTab: setActiveTab, shopDisplayUnit: displayUnit, setShopDisplayUnit: setDisplayUnit } = useEventSettings(eventId);

  const { plan, setPurchaseCounts, setAlreadyPurchasedCounts } = usePlanForEvent(eventId);
  const { purchaseCounts, alreadyPurchasedCounts } = plan;

  const { t, i18n } = useTranslation('planner');
  const locale = i18n.language as Locale;

  useEffect(() => {
    if (!activeTab) {
      const categories = Object.keys(shop);
      setActiveTab(categories[0]);
    }
  }, [shop]);

  // 2. Highest efficiency AP cost calculation by event goods
  const currencyApCostMap = useMemo(() => {
    const apMap: Record<number, number> = {};
    const eventCurrencyIds = new Set(eventData.currency?.map((c) => c.ItemUniqueId));

    eventCurrencyIds.forEach((currencyId) => {
      let bestApPerItem = Infinity;

      // Find all the 'repeatable' stages that drop the goods.
      const stagesThatDropThis = allStages.filter((s) => s.StageEnterCostAmount == 20 && s.type === 'stage' && s.EventContentStageReward.some((r) => r.RewardId === currencyId));

      for (const stage of stagesThatDropThis) {
        const totalRewardSum = stage.EventContentStageReward.filter((r) => r.RewardTagStr == 'Event')
          .map((v) => v.RewardAmount)
          .reduce((a, b) => a + b);
        const rewardInfo = stage.EventContentStageReward.find((r) => r.RewardId === currencyId && r.RewardTagStr == 'Event');
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
    const allItems = Object.values(shop).flat();

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
    const itemsInCategory = shop[categoryId];

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
    const itemsInCategory = shop[categoryId];
    const itemIdsToRemove = new Set(itemsInCategory.map((item) => item.Id));
    const currentCounts = purchaseCounts ?? {};
    const newCounts: Record<number, number> = {};
    Object.entries(currentCounts).forEach(([key, value]) => {
      if (!itemIdsToRemove.has(Number(key))) {
        newCounts[Number(key)] = value;
      }
    });
    setPurchaseCounts(() => newCounts);
  };

  /*
    const handleSelectAllByTypeInCategory = (type: ItemType, categoryId: string) => {
      const newCounts = { ...purchaseCounts };
      const itemsInCategory = shop[categoryId];
  
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
    const itemsInCategory = shop[categoryId];

    itemsInCategory.forEach((item) => {
      if (!item.Goods?.length) return;

      const goodsInfo = item.Goods[0];
      const rewardId = goodsInfo.ParcelId[0];
      const rewardType = goodsInfo.ParcelTypeStr[0];
      const itemInfo = eventData.icons[rewardType]?.[rewardId.toString()];
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

  const itemTypeButtons = useMemo(
    () => [
      { label: t('item.reports'), type: 'ExpGrowth' as const },
      { label: t('item.equipment'), type: 'Equipment' as const },
      { label: t('label.tacticalBD'), type: 'TacticalBD' as const },
      { label: t('label.techNote'), type: 'TechNote' as const },
      { label: t('label.opart'), type: 'Opart' as const },
      { label: t('label.material'), type: 'Material' as const },
      { label: t('item.gifts'), type: 'Favor' as const },
      { label: t('label.furniture'), type: 'Furniture' as const },
      { label: t('common.credits'), type: 'Credit' as const },
      { label: t('label.coin'), type: 'Coin' as const },
      { label: t('item.eleph'), type: 'SecretStone' as const },
      { label: t('common.pyroxene'), type: 'Gem' as const },
    ],
    [t],
  );

  const categorySelectionStates = useMemo(() => {
    if (!activeTab) return {};

    const itemsInCategory = shop[activeTab];
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
      const itemInfo = eventData.icons[rewardType]?.[rewardId.toString()];
      const itemType = getShopItemType(rewardType, rewardId, itemInfo);

      // Count only purchasable items that are not infinite purchase
      if (itemType) {
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
  }, [activeTab, shop, purchaseCounts, alreadyPurchasedCounts, itemTypeButtons]);

  const shopCategories = useMemo(() => Object.entries(shop), [shop]);

  const apConversionNotice = useMemo(() => {
    if (displayUnit !== 'ap' || !activeTab) return null;

    const itemsInCurrentCategory = shop[activeTab];

    let hasReports = false;
    let hasEnhancementStones = false;

    for (const item of itemsInCurrentCategory) {
      if (item.Goods) {
        const goodsInfo = item.Goods[0];
        const rewardId = goodsInfo.ParcelId[0];
        const rewardType = goodsInfo.ParcelTypeStr[0];
        const itemInfo = eventData.icons[rewardType]?.[rewardId.toString()];

        // Simplify logic by calling helper function
        const currentItemType = getShopItemType(rewardType, rewardId, itemInfo);
        if (currentItemType == 'Equipment') hasEnhancementStones = true;
        else if (currentItemType == 'ExpGrowth') hasReports = true;
      }
    }

    return (
      <div className="space-y-2">
        {/* 1. Basic informational text (always displayed) */}
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('ui.defaultNotice')}</p>

        {/* 2. Statement related to the report  */}
        {/* {hasReports && (
          <div className="text-xs text-orange-700 dark:text-orange-400 border-t border-orange-200 dark:border-orange-800 pt-2 mt-2">
            <p>
              <strong>{t('ui.reportNoticeTitle')}</strong>
            </p>
            <p className="font-mono text-[10px] opacity-80">{t('ui.reportNoticeFormula')}</p>
          </div>
        )} */}
        {hasReports && (
          <div className="text-xs text-orange-700 dark:text-orange-400 border-t border-orange-200 dark:border-orange-800 pt-2 mt-2 space-y-2">
            {/* Current standard */}
            <div className="line-through opacity-70">
              <p>
                <strong>{t('ui.reportNoticeTitle')}</strong>
              </p>
              <p className="font-mono text-[10px] opacity-80">{t('ui.reportNoticeFormula')}</p>
            </div>

            {/* Standard after update (Main Story Part 2 Prologue) */}
            <div>
              <p>
                <strong>{t('ui.reportNoticeUpcomingTitle')}</strong>
              </p>
              <p className="font-mono text-[10px] opacity-80">{t('ui.reportNoticeUpcomingFormula')}</p>
            </div>
          </div>
        )}

        {/* 3. a phrase related to EnhancementStones */}
        {hasEnhancementStones && (
          <div className="text-xs text-orange-700 dark:text-orange-400 border-t border-orange-200 dark:border-orange-800 pt-2 mt-2 space-y-2">
            {/* Current standard (strikethrough applied) */}
            <div className="line-through opacity-70">
              <p>
                <strong>{t('ui.enhancementStoneNoticeTitle')}</strong>
              </p>
              <p className="font-mono text-[10px] opacity-80">{t('ui.enhancementStoneNoticeFormula')}</p>
            </div>

            {/* Standard after update (Main Story Part 2 Prologue) */}
            <div>
              <p>
                <strong>{t('ui.enhancementStoneNoticeUpcomingTitle')}</strong>
              </p>
              <p className="font-mono text-[10px] opacity-80">{t('ui.enhancementStoneNoticeUpcomingFormula')}</p>
            </div>
          </div>
        )}
      </div>
    );
  }, [displayUnit, activeTab, eventData, locale]);

  return (
    <>
      <div data-component-name="ShopPlanner" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Title */}
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 shrink-0">{t('page.eventShop')}</h2>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-sm font-semibold text-neutral-600 dark:text-neutral-300">
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
      <div className="flex flex-wrap border-b-2 border-neutral-200 dark:border-neutral-700 mb-4 pb-4">
        {shopCategories.map(([categoryId]) => {
          const shopInfo = eventData.shop_info?.find((info) => info.CategoryType.toString() === categoryId);
          const currencyId = shopInfo?.CostParcelId?.[0];

          const currencyName = currencyId
            ? getLocalizeEtcName(eventData.icons.Item[currencyId]?.LocalizeEtc, locale) ||
              getLocalizeEtcName(eventData.icons.Item[currencyId]?.LocalizeEtc, 'ja') ||
              getLocalizeEtcName(eventData.icons.Currency[currencyId].LocalizeEtc, locale)
            : `Shop ${categoryId}`;
          return (
            <button
              key={categoryId}
              onClick={() => setActiveTab(categoryId)}
              className={`flex items-center space-x-2 px-3 pt-4 text-sm font-semibold border-b-2 -mb-0.5 ${
                activeTab === categoryId
                  ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
            >
              <span>
                <img
                  src={`data:image/webp;base64,${iconData.Item[currencyId?.toString() ?? ''] || iconData.Currency[currencyId?.toString() ?? '']}`}
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
          // console.log('shop - activeTab', activeTab);
          if (activeTab !== categoryId) return null; // Render only the active tab

          // Find shop name using shop_info
          // const shopInfo = shop_info?.find(info => info.CategoryType.toString() === categoryId);
          // const currencyId = shopInfo?.CostParcelId[0];
          // const currencyName = currencyId ? eventData.icons.Item[currencyId]?.LocalizeEtc?.NameKr : `Shop ${categoryId}`;

          const availableTypesInCategory = new Set<string>();
          items.forEach((item) => {
            if (!item.Goods?.length) return;
            const goodsInfo = item.Goods[0];
            const rewardId = goodsInfo.ParcelId[0];
            const rewardType = goodsInfo.ParcelTypeStr[0];
            const itemInfo = eventData.icons[rewardType]?.[rewardId.toString()];

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
                          ${isDisabled ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed' : 'bg-teal-500/10 dark:bg-teal-600/20 text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 dark:hover:bg-teal-600/30 cursor-pointer'}`}
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
                    className="bg-neutral-400 hover:bg-neutral-500 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white font-bold text-xs py-1 px-2 rounded-md"
                  >
                    {t('button.resetCurrentTab')}
                  </button>
                </div>
              </div>

              <div data-component-name="ShopPlanner_goodsStand" className="flex flex-wrap gap-4 justify-center">
                {(() => {
                  const chunkSize = 4;
                  const chunks: (typeof items)[] = [];
                  for (let i = 0; i < items.length; i += chunkSize) {
                    chunks.push(items.slice(i, i + chunkSize));
                  }
                  return chunks.map((chunk, chunkIndex) => (
                    <div key={chunkIndex} className="flex gap-2 min-w-0">
                      {chunk.map((item) => {
                        if (!item.Goods?.length) return null;
                        const goodsInfo = item.Goods[0];
                        const rewardId = goodsInfo.ParcelId[0];
                        const rewardType = goodsInfo.ParcelTypeStr[0];
                        // const cost = goodsInfo.ConsumeParcelAmount[0];
                        const alreadyPurchased = alreadyPurchasedCounts?.[item.Id] || 0;
                        const currentPurchase = purchaseCounts?.[item.Id] || 0;
                        const isInfinite = item.PurchaseCountLimit === 0;
                        const remainingLimit = isInfinite ? Infinity : item.PurchaseCountLimit - alreadyPurchased;
                        const displayLimit = isInfinite ? '∞' : item.PurchaseCountLimit - alreadyPurchased;

                        const costCurrencyId = goodsInfo.ConsumeParcelId[0];
                        const extraStep = goodsInfo.ConsumeExtraStep ?? [];
                        const extraAmount = goodsInfo.ConsumeExtraAmount ?? [];
                        const baseAmount = goodsInfo.ConsumeParcelAmount[0];
                        // For tiered items: price of the next item after alreadyPurchased + currentPurchase
                        const costAmount = getCurrentTierPrice(alreadyPurchased + currentPurchase, extraStep, extraAmount, baseAmount);
                        const apCostPerItem = currencyApCostMap[costCurrencyId] || null;
                        const totalApCost = apCostPerItem ? costAmount * apCostPerItem : null;

                        return (
                          <div
                            key={item.Id}
                            className={`w-[calc(25%-3px)] sm:w-24 bg-neutral-100 dark:bg-neutral-700/60 p-1 rounded-sm shadow-sm flex flex-col justify-between ${item.PurchaseCountLimit && alreadyPurchased === item.PurchaseCountLimit ? 'opacity-30' : ''}`}
                          >
                            <div className="flex justify-center">
                              <ItemIcon
                                type={rewardType}
                                itemId={rewardId.toString()}
                                amount={goodsInfo.ParcelAmount[0]}
                                size={12}
                                eventData={eventData}
                                iconData={iconData}
                                allStudents={allStudents}
                                studentPortraits={studentPortraits}
                              />
                            </div>
                            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center justify-center mt-0.5">
                              <span
                                className="inline-flex items-center
                          bg-no-repeat bg-bottom
                          bg-[linear-gradient(to_top,currentColor_1px,transparent_1px)]
                          bg-size-[100%_1px]"
                              >
                                {displayUnit === 'ap' ? (
                                  <>
                                    <span className="font-bold text-teal-600 dark:text-teal-400">{totalApCost ? totalApCost.toPrecision(3) : 'NA'}</span>
                                    <img src={`data:image/webp;base64,${iconData.Currency['5']}`} className="w-3 h-3 ml-0.5 object-cover rounded-full" />
                                    {/* <span className="ml-0.5">AP</span> */}
                                  </>
                                ) : (
                                  <>
                                    <span>{costAmount.toLocaleString()}</span>
                                    <img
                                      src={`data:image/webp;base64,${iconData.Item[costCurrencyId.toString()] || iconData.Currency[costCurrencyId]}`}
                                      className="w-3 h-3 ml-0.5 object-cover rounded-full"
                                    />
                                  </>
                                )}
                              </span>
                              {/* <span className="hidden sm:block mx-1">|</span> */}
                              {/* <span>{t('ui.stock')} {displayLimit}</span> */}
                              <span>&times; {displayLimit}</span>
                            </div>
                            <div className="mt-2 space-y-1 text-xs">
                              <div>
                                <label className="text-[10px] text-neutral-500 dark:text-neutral-400 font-semibold">{t('ui.alreadyPurchased')}</label>
                                <NumberInput
                                  value={alreadyPurchased}
                                  onChange={(val) => handleAlreadyPurchasedChange(item.Id, val, item.PurchaseCountLimit)}
                                  min={0}
                                  max={isInfinite ? Infinity : item.PurchaseCountLimit}
                                  disabled={isInfinite}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-neutral-500 dark:text-neutral-400 font-semibold">{t('ui.purchase')}</label>
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
                  ));
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
