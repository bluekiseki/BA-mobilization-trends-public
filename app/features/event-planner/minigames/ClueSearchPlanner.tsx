// app/components/planner/minigame/ClueSearchPlanner.tsx
import type { ClueSearchTab, ClueSearchResult } from '~/types/minigame/clueSearch';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { ItemIcon } from '../../../components/item/Icon';
import type { EventData, IconData } from '~/types/plannerData';
import { useEventSettings } from '~/features/event-planner/useSettingsStore';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';

import { useTranslation } from 'react-i18next';
import { getItemSortPriority } from '~/features/event-planner/logic/itemSort';
import { CustomNumberInput } from '~/components/common/CustomInput';
import { type ClueSearchConfig, defaultClueSearchConfig } from '~/types/minigame/clueSearch';
import { getClueSearchCostModel, searchesForFragments } from '~/features/event-planner/logic/clueSearch';
import { getItemName } from '../../../utils/locale';
import type { Locale } from '~/utils/i18n/config';

export type { ClueSearchConfig };
export { defaultClueSearchConfig };

// --- Type definitions ---

interface ClueSearchPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onCalculate: (result: ClueSearchResult | null) => void;
  remainingCurrency: Record<number, number>;
}

// --- Locale helper ---
const getLocalizedName = (
  hintlocalize: {
    NameKr: string;
    NameJp: string;
    NameEn?: string | null;
    NameTw?: string | null;
  },
  lang: string,
): string => {
  if (lang === 'ko' || lang === 'kr') return hintlocalize.NameKr;
  if (lang === 'ja' || lang === 'jp') return hintlocalize.NameJp;
  if (lang === 'en') return hintlocalize.NameEn || hintlocalize.NameJp;
  if (lang === 'zh_Hant' || lang === 'tw') return hintlocalize.NameTw || hintlocalize.NameJp;
  return hintlocalize.NameJp;
};

const getLocalizedDesc = (
  hintlocalize: {
    DescriptionKr: string;
    DescriptionJp: string;
    DescriptionEn?: string | null;
    DescriptionTw?: string | null;
  },
  lang: string,
): string => {
  if (lang === 'ko' || lang === 'kr') return hintlocalize.DescriptionKr;
  if (lang === 'ja' || lang === 'jp') return hintlocalize.DescriptionJp;
  if (lang === 'en') return hintlocalize.DescriptionEn || hintlocalize.DescriptionJp;
  if (lang === 'zh_Hant' || lang === 'tw') return hintlocalize.DescriptionTw || hintlocalize.DescriptionJp;
  return hintlocalize.DescriptionJp;
};

// --- Component ---
export const ClueSearchPlanner = (props: ClueSearchPlannerProps) => {
  const data = props.eventData.clue;
  return data ? <ClueSearchPlannerContent {...props} eventData={{ ...props.eventData, clue: data }} /> : null;
};

const ClueSearchPlannerContent = ({
  eventId,
  eventData,
  iconData,
  onCalculate,
}: ClueSearchPlannerProps & { eventData: ClueSearchPlannerProps['eventData'] & { clue: NonNullable<ClueSearchPlannerProps['eventData']['clue']> } }) => {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'clue_search' });
  const { t: t_ui } = useTranslation('ui');
  const [activeHint, setActiveHint] = useState<string | null>(null);

  const { clueSearchActiveTab: activeTab, setClueSearchActiveTab: setActiveTab, clueSearchDisplayResult: displayResult, setClueSearchDisplayResult: setDisplayResult } = useEventSettings(eventId);

  const { plan, setClueSearchConfig, setPurchaseCounts } = usePlanForEvent(eventId);
  const { alreadyPurchasedCounts, clueSearchConfig } = plan;
  const config: ClueSearchConfig = clueSearchConfig ?? defaultClueSearchConfig;

  const clueData = eventData.clue;

  // Lookup maps
  const roundMap = useMemo(() => {
    const map: Record<number, (typeof clueData.round)[0]> = {};
    clueData.round.forEach((r) => (map[r.Round] = r));
    return map;
  }, [clueData.round]);

  const clueMap = useMemo(() => {
    const map: Record<number, (typeof clueData.clue)[0]> = {};
    clueData.clue.forEach((c) => (map[c.ClueId] = c));
    return map;
  }, [clueData.clue]);

  // Last non-loop round (one-time content boundary)
  const { lastOneTimeRound, loopRound } = useMemo(() => {
    const nonLoop = clueData.round.filter((r) => !r.IsLoop);
    const loop = clueData.round.find((r) => r.IsLoop) ?? null;
    return {
      lastOneTimeRound: nonLoop.length > 0 ? Math.max(...nonLoop.map((r) => r.Round)) : 0,
      loopRound: loop,
    };
  }, [clueData.round]);

  const searchModel = useMemo(() => getClueSearchCostModel(clueData), [clueData]);

  // Per-round x per-clue required amounts (a clue can occupy several slots in one round)
  const requirementTable = useMemo(() => {
    const usedIds = new Set(clueData.round.flatMap((r) => r.ClueId));
    const clueIds = clueData.clue.map((c) => c.ClueId).filter((id) => usedIds.has(id));
    const rows = clueData.round.map((round) => {
      const amounts: Record<number, number> = {};
      round.ClueId.forEach((id, idx) => (amounts[id] = (amounts[id] ?? 0) + round.ClueCostAmount[idx]));
      // Round completion rewards + per-fragment submission rewards (same basis as the calculator)
      const rewards: Record<string, number> = {};
      round.Reward.RewardParcelId.forEach((id, idx) => {
        const key = `${round.Reward.RewardParcelTypeStr[idx]}_${id}`;
        rewards[key] = (rewards[key] ?? 0) + round.Reward.RewardParcelAmount[idx];
      });
      Object.entries(amounts).forEach(([id, amount]) => {
        const clue = clueMap[Number(id)];
        clue?.RewardParcelId.forEach((rewardId, idx) => {
          const key = `${clue.RewardParcelTypeStr[idx]}_${rewardId}`;
          rewards[key] = (rewards[key] ?? 0) + clue.RewardParcelAmount[idx] * amount;
        });
      });
      return { round, amounts, rewards, total: round.ClueCostAmount.reduce((sum, amount) => sum + amount, 0) };
    });
    return { clueIds, rows };
  }, [clueData.round, clueData.clue, clueMap]);

  // Shop price of one fragment per clue (shop-based events only)
  const clueShopPrice = useMemo(() => {
    const prices: Record<number, { costKey: string; unitCost: number }> = {};
    if (searchModel || !eventData.shop) return prices;
    const clueIds = new Set(clueData.clue.map((c) => c.ClueId));
    for (const items of Object.values(eventData.shop)) {
      for (const shopItem of items) {
        const goods = shopItem.Goods?.[0];
        if (!goods || goods.ParcelId.length !== 1 || goods.ConsumeParcelId.length !== 1) continue;
        const clueId = goods.ParcelId[0];
        if (goods.ParcelTypeStr[0] !== 'Item' || !clueIds.has(clueId) || prices[clueId]) continue;
        prices[clueId] = {
          costKey: `${goods.ConsumeParcelTypeStr[0]}_${goods.ConsumeParcelId[0]}`,
          unitCost: goods.ConsumeParcelAmount[0] / goods.ParcelAmount[0],
        };
      }
    }
    return prices;
  }, [searchModel, eventData.shop, clueData.clue]);

  // Currency columns shown in the requirement table
  const currencyKeys = useMemo(() => (searchModel ? [searchModel.costKey] : [...new Set(Object.values(clueShopPrice).map((p) => p.costKey))]), [searchModel, clueShopPrice]);

  const getCurrencyCost = useCallback(
    (amounts: Record<number, number>, fragments: number): Record<string, number> => {
      if (searchModel) return { [searchModel.costKey]: searchesForFragments(fragments, searchModel.inspirationConvertCount) * searchModel.costPerSearch };
      const cost: Record<string, number> = {};
      Object.entries(amounts).forEach(([id, amount]) => {
        const price = clueShopPrice[Number(id)];
        if (price) cost[price.costKey] = (cost[price.costKey] ?? 0) + price.unitCost * amount;
      });
      return cost;
    },
    [searchModel, clueShopPrice],
  );

  // Rounds included in the table's selected total (loop round is not selectable)
  const selectableRounds = useMemo(() => clueData.round.filter((r) => !r.IsLoop).map((r) => r.Round), [clueData.round]);
  const [selectedRounds, setSelectedRounds] = useState<Set<number>>(() => new Set(selectableRounds));
  const toggleSelectedRound = (round: number) =>
    setSelectedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });

  const selectedTotals = useMemo(() => {
    const perClue: Record<number, number> = {};
    let total = 0;
    requirementTable.rows
      .filter((row) => selectedRounds.has(row.round.Round))
      .forEach((row) => {
        requirementTable.clueIds.forEach((id) => (perClue[id] = (perClue[id] ?? 0) + (row.amounts[id] ?? 0)));
        total += row.total;
      });
    return { perClue, total, cost: getCurrencyCost(perClue, total) };
  }, [requirementTable, selectedRounds, getCurrencyCost]);

  const renderRewardIcons = (rewards: Record<string, number>) => (
    <div className="flex gap-2">
      {Object.entries(rewards)
        .sort(([ka], [kb]) => getItemSortPriority(ka, eventData) - getItemSortPriority(kb, eventData))
        .map(([key, amount]) => (
          <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={10} eventData={eventData} iconData={iconData} />
        ))}
    </div>
  );

  const allRoundsSelected = selectedRounds.size === selectableRounds.length;
  const toggleAllRounds = () => setSelectedRounds(allRoundsSelected ? new Set() : new Set(selectableRounds));

  const getRoundData = useCallback((round: number) => roundMap[round] ?? loopRound, [roundMap, loopRound]);

  const isSearchGuide = eventId === 863 && searchModel !== null;
  const currencyName = searchModel ? getItemName(searchModel.costKey, eventData.icons, i18n.language as Locale) : '';

  const calculate = useCallback(
    (cfg: ClueSearchConfig) => {
      const { startRound, endRound } = cfg;
      if (startRound > endRound) {
        setDisplayResult(null);
        onCalculate(null);
        return;
      }

      const totalRewards: Record<string, number> = {};
      const totalCost: Record<string, number> = {};
      let totalFragments = 0;

      for (let round = startRound; round <= endRound; round++) {
        const roundData = getRoundData(round);
        if (!roundData) continue;

        // Round completion rewards
        roundData.Reward.RewardParcelId.forEach((id, idx) => {
          const key = `${roundData.Reward.RewardParcelTypeStr[idx]}_${id}`;
          totalRewards[key] = (totalRewards[key] || 0) + roundData.Reward.RewardParcelAmount[idx];
        });

        // Per-clue-slot: cost is the actual Clue item; reward is the submission reward × amount
        roundData.ClueId.forEach((clueId, slotIdx) => {
          const amount = roundData.ClueCostAmount[slotIdx];
          totalFragments += amount;

          // Cost: actual clue item required (search-based events pay currency per search instead)
          if (!searchModel) {
            const costKey = `Item_${clueId}`;
            totalCost[costKey] = (totalCost[costKey] || 0) + amount;
          }

          // Submission reward per fragment
          const clue = clueMap[clueId];
          if (clue) {
            clue.RewardParcelId.forEach((rewardId, rewardIdx) => {
              const rewardKey = `${clue.RewardParcelTypeStr[rewardIdx]}_${rewardId}`;
              totalRewards[rewardKey] = (totalRewards[rewardKey] || 0) + clue.RewardParcelAmount[rewardIdx] * amount;
            });
          }
        });
      }

      let searches: number | undefined;
      if (searchModel) {
        searches = searchesForFragments(totalFragments, searchModel.inspirationConvertCount);
        totalCost[searchModel.costKey] = searches * searchModel.costPerSearch;
      }

      const result: ClueSearchResult = { cost: totalCost, rewards: totalRewards, searches };
      setDisplayResult(result);
      onCalculate(result);
    },
    [getRoundData, clueMap, searchModel, setDisplayResult, onCalculate],
  );

  // Auto-calculate on mount if no cached result
  useEffect(() => {
    if (!displayResult) {
      calculate(config);
    }
  }, []);

  const handleChange = (field: keyof ClueSearchConfig, raw: number) => {
    const value = Math.max(1, raw || 1);
    const newConfig: ClueSearchConfig =
      field === 'startRound' ? { startRound: value, endRound: Math.max(value, config.endRound) } : { startRound: Math.min(config.startRound, value), endRound: value };
    setClueSearchConfig(newConfig);
    calculate(newConfig);
  };

  // Shortcut: rounds 1 ~ lastOneTimeRound (max non-repeatable rewards)
  const handleShortcutMaxOneTime = () => {
    if (lastOneTimeRound < 1) return;
    const newConfig: ClueSearchConfig = { startRound: 1, endRound: lastOneTimeRound };
    setClueSearchConfig(newConfig);
    calculate(newConfig);
  };

  // Shop auto-buy: find shop items that give the needed clue items and set purchase counts
  const handleAutoBuyFromShop = useCallback(() => {
    if (!displayResult || !eventData.shop) return;

    // Build clueId -> remaining needed amount map
    const neededClues: Record<number, number> = {};
    for (const [key, amount] of Object.entries(displayResult.cost)) {
      const [type, idStr] = key.split('_');
      if (type === 'Item') {
        neededClues[Number(idStr)] = amount;
      }
    }

    const newPurchaseCounts: Record<number, number> = {};

    for (const items of Object.values(eventData.shop)) {
      for (const shopItem of items) {
        if (!shopItem.Goods?.length) continue;
        const goods = shopItem.Goods[0];

        for (let i = 0; i < goods.ParcelId.length; i++) {
          const rewardId = goods.ParcelId[i];
          const rewardType = goods.ParcelTypeStr[i];
          const rewardAmount = goods.ParcelAmount[i];

          if (rewardType === 'Item' && neededClues[rewardId] !== undefined && neededClues[rewardId] > 0) {
            const alreadyPurchased = alreadyPurchasedCounts?.[shopItem.Id] || 0;
            const isInfinite = shopItem.PurchaseCountLimit === 0;
            const remainingLimit = isInfinite ? Infinity : shopItem.PurchaseCountLimit - alreadyPurchased;

            const toPurchase = Math.min(Math.ceil(neededClues[rewardId] / rewardAmount), remainingLimit);
            if (toPurchase > 0) {
              newPurchaseCounts[shopItem.Id] = toPurchase;
              neededClues[rewardId] = Math.max(0, neededClues[rewardId] - toPurchase * rewardAmount);
            }
          }
        }
      }
    }

    if (Object.keys(newPurchaseCounts).length > 0) {
      setPurchaseCounts((prev) => ({ ...prev, ...newPurchaseCounts }));
    }
  }, [displayResult, eventData.shop, alreadyPurchasedCounts, setPurchaseCounts]);

  // Whether any shop items exist that sell clue items
  const hasShopClues = useMemo(() => {
    if (!eventData.shop || !clueData) return false;
    const clueIds = new Set(clueData.clue.map((c) => c.ClueId));
    for (const items of Object.values(eventData.shop)) {
      for (const shopItem of items) {
        if (!shopItem.Goods?.length) continue;
        const goods = shopItem.Goods[0];
        for (let i = 0; i < goods.ParcelId.length; i++) {
          if (goods.ParcelTypeStr[i] === 'Item' && clueIds.has(goods.ParcelId[i])) return true;
        }
      }
    }
    return false;
  }, [eventData.shop, clueData]);

  const tabs: { id: ClueSearchTab; name: string }[] = [
    { id: 'info', name: t_ui('info') },
    { id: 'calculator', name: t_ui('calculator') },
  ];

  return (
    <>
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title')}</h2>

      <div className="mt-4 space-y-4">
        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${activeTab === tab.id ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400' : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'}`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {isSearchGuide && searchModel ? (
          <div className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            <p>{t('guide863.searchFlow', { cost: searchModel.costPerSearch, currency: currencyName })}</p>
            <p>{t('guide863.inspirationFlow', { count: searchModel.inspirationConvertCount })}</p>
          </div>
        ) : (
          searchModel && (
            <div className="space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
              <p>{t('searchRule', { cost: searchModel.costPerSearch })}</p>
              {searchModel.inspirationConvertCount > 0 && <p>{t('inspirationRule', { count: searchModel.inspirationConvertCount })}</p>}
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('searchAssumption')}</p>
            </div>
          )
        )}

        {/* Info Tab */}
        {activeTab === 'info' && (
          <div className="space-y-3">
            {/* Required amounts per round x clue */}
            {requirementTable.clueIds.length > 0 && (
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="min-w-max border-separate border-spacing-0 text-xs tabular-nums">
                  <thead>
                    <tr>
                      <th className="border-b border-neutral-200 py-1.5 pr-2 text-left font-medium dark:border-neutral-700">
                        <label className="flex cursor-pointer items-center" title={allRoundsSelected ? t_ui('deselectAll') : t_ui('selectAll')}>
                          <input
                            type="checkbox"
                            checked={allRoundsSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = selectedRounds.size > 0 && !allRoundsSelected;
                            }}
                            onChange={toggleAllRounds}
                            aria-label={allRoundsSelected ? t_ui('deselectAll') : t_ui('selectAll')}
                            className="h-4 w-4 rounded border-neutral-300 bg-transparent dark:border-neutral-600"
                          />
                        </label>
                      </th>
                      {requirementTable.clueIds.map((clueId) => {
                        const clue = clueMap[clueId];
                        const name = clue ? getLocalizedName(clue.Hintlocalize, i18n.language) : String(clueId);
                        return (
                          <th key={clueId} className="border-b border-neutral-200 px-0.5 py-1.5 sm:px-2 dark:border-neutral-700" title={name}>
                            <div className="flex justify-center">
                              <ItemIcon type="Item" itemId={String(clueId)} amount="" size={6} eventData={eventData} iconData={iconData} />
                            </div>
                          </th>
                        );
                      })}
                      <th className="border-b border-neutral-200 py-1.5 pl-2 text-right font-medium text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">{t_ui('total')}</th>
                      {currencyKeys.map((key) => (
                        <th key={key} className="border-b border-neutral-200 py-1.5 pl-2 dark:border-neutral-700">
                          <div className="flex justify-end">
                            <ItemIcon type={key.split('_')[0]} itemId={key.split('_')[1]} amount="" size={6} eventData={eventData} iconData={iconData} />
                          </div>
                        </th>
                      ))}
                      <th className="border-b border-neutral-200 py-1.5 pl-4 text-left font-medium text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">{t_ui('obtainedRewards')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirementTable.rows.map(({ round, amounts, rewards, total }) => {
                      const cost = getCurrencyCost(amounts, total);
                      return (
                        <tr key={round.Round}>
                          <td className="whitespace-nowrap border-b border-neutral-100 py-1.5 pr-2 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
                            {round.IsLoop ? (
                              <span className="flex items-center gap-1.5">
                                <span className="h-4 w-4" />
                                {t('roundLabel', { round: round.Round })}~
                              </span>
                            ) : (
                              <label className="flex cursor-pointer items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={selectedRounds.has(round.Round)}
                                  onChange={() => toggleSelectedRound(round.Round)}
                                  className="h-4 w-4 rounded border-neutral-300 bg-transparent dark:border-neutral-600"
                                />
                                {t('roundLabel', { round: round.Round })}
                              </label>
                            )}
                          </td>
                          {requirementTable.clueIds.map((clueId) => (
                            <td key={clueId} className="border-b border-neutral-100 px-0.5 py-1.5 sm:px-2 text-center text-neutral-800 dark:border-neutral-800 dark:text-neutral-200">
                              {amounts[clueId] ?? <span className="text-neutral-300 dark:text-neutral-600">-</span>}
                            </td>
                          ))}
                          <td className="border-b border-neutral-100 py-1.5 pl-2 text-right font-semibold text-neutral-800 dark:border-neutral-800 dark:text-neutral-200">{total}</td>
                          {currencyKeys.map((key) => (
                            <td key={key} className="border-b border-neutral-100 py-1.5 pl-2 text-right text-neutral-800 dark:border-neutral-800 dark:text-neutral-200">
                              {(cost[key] ?? 0).toLocaleString(i18n.language)}
                            </td>
                          ))}
                          <td className="border-b border-neutral-100 py-1 pl-4 dark:border-neutral-800">{renderRewardIcons(rewards)}</td>
                        </tr>
                      );
                    })}
                    <tr className="font-semibold">
                      <td className="py-1.5 pr-2 leading-tight text-neutral-700 dark:text-neutral-200">{t('selectedTotal')}</td>
                      {requirementTable.clueIds.map((clueId) => (
                        <td key={clueId} className="px-0.5 py-1.5 sm:px-2 text-center text-neutral-900 dark:text-neutral-100">
                          {selectedTotals.perClue[clueId] ?? 0}
                        </td>
                      ))}
                      <td className="py-1.5 pl-2 text-right text-neutral-900 dark:text-neutral-100">{selectedTotals.total}</td>
                      {currencyKeys.map((key) => (
                        <td key={key} className="py-1.5 pl-2 text-right text-neutral-900 dark:text-neutral-100">
                          {(selectedTotals.cost[key] ?? 0).toLocaleString(i18n.language)}
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {clueData.round.map((round) => {
              const fragments = round.ClueCostAmount.reduce((sum, amount) => sum + amount, 0);
              const conversion = searchModel?.inspirationConvertCount ?? 0;
              const roundSearches = isSearchGuide ? Number((fragments / (1 + (conversion > 0 ? 1 / conversion : 0))).toFixed(1)) : searchesForFragments(fragments, conversion);

              return (
                <div key={round.Round} className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className={`font-bold text-xs px-2 py-0.5 rounded ${round.IsLoop ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'}`}
                    >
                      {round.IsLoop ? t('roundLoop', { round: round.Round }) : t('roundLabel', { round: round.Round })}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('totalFragments', { count: round.ClueCostAmount.reduce((a, b) => a + b, 0) })}</span>
                    {searchModel && (
                      <span className="text-xs text-neutral-600 dark:text-neutral-300">
                        {isSearchGuide
                          ? t('guide863.roundActions', {
                              searches: roundSearches,
                              inspiration: conversion > 0 ? Number((roundSearches / conversion).toFixed(1)) : 0,
                            })
                          : t('roundSearchCount', { count: roundSearches })}
                      </span>
                    )}
                    {isSearchGuide && searchModel && (
                      <span className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
                        <ItemIcon type={searchModel.costKey.split('_')[0]} itemId={searchModel.costKey.split('_')[1]} amount="" size={6} eventData={eventData} iconData={iconData} />
                        <span className="tabular-nums">x{(roundSearches * searchModel.costPerSearch).toLocaleString(i18n.language)}</span>
                      </span>
                    )}
                  </div>

                  {/* Clue slots */}
                  {isSearchGuide && <h4 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('guide863.requiredClues')}</h4>}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {round.ClueId.map((clueId, idx) => {
                      const clue = clueMap[clueId];
                      const hintKey = `${round.Round}-${clueId}`;
                      const isHintOpen = activeHint === hintKey;
                      return (
                        <div key={clueId} className="relative">
                          <div className="flex items-center gap-1 bg-white dark:bg-neutral-700 rounded px-2 py-1 text-xs border border-neutral-100 dark:border-neutral-600">
                            <span className="font-bold text-neutral-400 dark:text-neutral-500">#{round.ClueSlotNumber[idx]}</span>
                            <ItemIcon type="Item" itemId={String(clueId)} amount={round.ClueCostAmount[idx]} size={7} eventData={eventData} iconData={iconData} />
                            {clue && <span className="text-neutral-700 dark:text-neutral-300">{getLocalizedName(clue.Hintlocalize, i18n.language)}</span>}
                            {clue?.HintUse && (
                              <button
                                onClick={() => setActiveHint(isHintOpen ? null : hintKey)}
                                className={`ml-0.5 w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold transition-colors ${isHintOpen ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-600 text-neutral-500 dark:text-neutral-400 hover:bg-blue-100 dark:hover:bg-blue-900/40'}`}
                                aria-label="hint"
                              >
                                ?
                              </button>
                            )}
                          </div>
                          {isHintOpen && clue && (
                            <div className="absolute left-0 top-full mt-1 z-15 w-56 bg-white dark:bg-neutral-800 border border-blue-200 dark:border-blue-700 rounded-lg shadow-lg p-2 text-xs">
                              <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">{getLocalizedName(clue.Hintlocalize, i18n.language)}</p>
                              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed whitespace-pre-line">{getLocalizedDesc(clue.Hintlocalize, i18n.language)}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Round completion rewards */}
                  {isSearchGuide && (
                    <h4 className="mb-2 mt-3 border-t border-neutral-200 pt-3 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">{t_ui('rewards')}</h4>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {round.Reward.RewardParcelId.map((id, idx) => (
                      <ItemIcon
                        key={idx}
                        type={round.Reward.RewardParcelTypeStr[idx]}
                        itemId={String(id)}
                        amount={round.Reward.RewardParcelAmount[idx]}
                        size={9}
                        eventData={eventData}
                        iconData={iconData}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Calculator Tab */}
        {activeTab === 'calculator' && (
          <div className={isSearchGuide ? 'space-y-6 text-sm' : 'p-4 rounded-b-lg bg-neutral-50 dark:bg-neutral-800/50 space-y-6 text-sm'}>
            {/* Range inputs */}
            <div className="space-y-3">
              <h3 className="font-bold text-base dark:text-neutral-200">{t('rangeTitle')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="dark:text-neutral-300">{t('startRound')}</label>
                  <CustomNumberInput
                    min={1}
                    value={config.startRound}
                    onChange={(e) => handleChange('startRound', Number(e))}
                    className="w-full p-1 border rounded mt-1 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="dark:text-neutral-300">{t('endRound')}</label>
                  <CustomNumberInput
                    min={config.startRound}
                    value={config.endRound}
                    onChange={(e) => handleChange('endRound', Number(e))}
                    className="w-full p-1 border rounded mt-1 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-100"
                  />
                </div>
              </div>

              {/* Shortcut: max one-time rewards */}
              {lastOneTimeRound > 0 && (
                <button
                  onClick={handleShortcutMaxOneTime}
                  className="w-full flex items-center justify-between p-3 rounded border border-neutral-200 dark:border-neutral-600 hover:bg-white dark:hover:bg-neutral-700 transition-colors text-left group"
                >
                  <div>
                    <div className="font-bold text-sm text-neutral-800 dark:text-neutral-200">{t('shortcutMaxOneTime')}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t('shortcutMaxOneTimeDesc', { round: lastOneTimeRound })}</div>
                  </div>
                  {!isSearchGuide && <span className="text-lg group-hover:scale-110 transition-transform">⚡</span>}
                </button>
              )}
            </div>

            {/* Results */}
            {displayResult && (
              <div className="pt-4 border-t dark:border-neutral-700 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base dark:text-neutral-200">{t_ui('calculationResult')}</h3>
                  {!searchModel && hasShopClues && (
                    <button
                      onClick={handleAutoBuyFromShop}
                      className="bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white font-bold text-xs py-1.5 px-3 rounded-lg"
                      title={t('autoBuyTooltip')}
                    >
                      {t('autoBuy')}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-red-50 dark:bg-red-900/40 p-3 rounded-lg">
                    {isSearchGuide && searchModel && displayResult.searches != null ? (
                      <div className="mb-3 space-y-1 text-red-900 dark:text-red-200">
                        <h4 className="font-medium">{t('guide863.minimumSearches')}</h4>
                        <p className="font-semibold tabular-nums">{t('searchCount', { count: displayResult.searches })}</p>
                        <p className="font-semibold tabular-nums">
                          {currencyName} {(displayResult.cost[searchModel.costKey] ?? 0).toLocaleString(i18n.language)}
                        </p>
                      </div>
                    ) : (
                      <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">
                        {t('cost')}
                        {displayResult.searches != null && <span className="ml-2 text-xs font-normal">{t('searchCount', { count: displayResult.searches })}</span>}
                      </h4>
                    )}
                    {isSearchGuide && searchModel && displayResult.searches != null ? (
                      <p className="mb-3 text-xs text-red-800 dark:text-red-200">{t('guide863.calculationNote')}</p>
                    ) : (
                      searchModel &&
                      displayResult.searches != null && (
                        <p className="mb-2 text-xs leading-relaxed text-red-800 dark:text-red-200">
                          {t('searchBreakdown', {
                            searches: displayResult.searches,
                            inspiration: searchModel.inspirationConvertCount > 0 ? Math.floor(displayResult.searches / searchModel.inspirationConvertCount) : 0,
                            total: displayResult.searches + (searchModel.inspirationConvertCount > 0 ? Math.floor(displayResult.searches / searchModel.inspirationConvertCount) : 0),
                          })}
                        </p>
                      )
                    )}
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(displayResult.cost).map(([key, amount]) => (
                        <ItemIcon
                          key={key}
                          type={key.split('_')[0]}
                          itemId={key.split('_')[1]}
                          amount={isSearchGuide ? amount.toLocaleString(i18n.language) : amount}
                          size={11}
                          eventData={eventData}
                          iconData={iconData}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/40 p-3 rounded-lg">
                    <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t_ui('obtainedRewards')}</h4>
                    {isSearchGuide && <p className="mb-2 text-xs text-green-800 dark:text-green-200">{t('guide863.rewardIncludes')}</p>}
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                      {Object.entries(displayResult.rewards)
                        .sort(([ka], [kb]) => getItemSortPriority(ka, eventData) - getItemSortPriority(kb, eventData))
                        .map(([key, amount]) => (
                          <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={11} eventData={eventData} iconData={iconData} />
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
