// app/components/planner/minigame/ClueSearchPlanner.tsx
import { useState, useMemo, useCallback, useEffect } from 'react';
import { ItemIcon } from '../common/Icon';
import type { EventData, IconData } from '~/types/plannerData';
import { useEventSettings } from '~/store/planner/useSettingsStore';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';

import { useTranslation } from 'react-i18next';
import { getItemSortPriority } from '~/utils/itemSort';
import { CustomNumberInput } from '~/components/CustomInput';
import { type ClueSearchConfig, defaultClueSearchConfig } from '~/types/minigame/clueSearch';

export type { ClueSearchConfig };
export { defaultClueSearchConfig };

// --- Type definitions ---
export type ClueSearchTab = 'info' | 'calculator';

export type ClueSearchResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};

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
export const ClueSearchPlanner = ({ eventId, eventData, iconData, onCalculate }: ClueSearchPlannerProps) => {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'clue_search' });
  const { t: t_ui } = useTranslation('ui');
  const [activeHint, setActiveHint] = useState<number | null>(null);

  const { clueSearchActiveTab: activeTab, setClueSearchActiveTab: setActiveTab, clueSearchDisplayResult: displayResult, setClueSearchDisplayResult: setDisplayResult } = useEventSettings(eventId);

  const { plan, setClueSearchConfig, setPurchaseCounts } = usePlanForEvent(eventId);
  const { alreadyPurchasedCounts, clueSearchConfig } = plan;
  const config: ClueSearchConfig = clueSearchConfig ?? defaultClueSearchConfig;

  const clueData = eventData.clue;
  if (!clueData) return null;

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

  const getRoundData = useCallback((round: number) => roundMap[round] ?? loopRound, [roundMap, loopRound]);

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

          // Cost: actual clue item required
          const costKey = `Item_${clueId}`;
          totalCost[costKey] = (totalCost[costKey] || 0) + amount;

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

      const result: ClueSearchResult = { cost: totalCost, rewards: totalRewards };
      setDisplayResult(result);
      onCalculate(result);
    },
    [getRoundData, clueMap, setDisplayResult, onCalculate],
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
    { id: 'info', name: t('tabInfo') },
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

        {/* Info Tab */}
        {activeTab === 'info' && (
          <div className="space-y-3">
            {clueData.round.map((round) => (
              <div key={round.Round} className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`font-bold text-xs px-2 py-0.5 rounded ${round.IsLoop ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'}`}
                  >
                    {round.IsLoop ? t('roundLoop', { round: round.Round }) : t('roundLabel', { round: round.Round })}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('totalFragments', { count: round.ClueCostAmount.reduce((a, b) => a + b, 0) })}</span>
                </div>

                {/* Clue slots */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {round.ClueId.map((clueId, idx) => {
                    const clue = clueMap[clueId];
                    const isHintOpen = activeHint === clueId;
                    return (
                      <div key={clueId} className="relative">
                        <div className="flex items-center gap-1 bg-white dark:bg-neutral-700 rounded px-2 py-1 text-xs border border-neutral-100 dark:border-neutral-600">
                          <span className="font-bold text-neutral-400 dark:text-neutral-500">#{round.ClueSlotNumber[idx]}</span>
                          <ItemIcon type="Item" itemId={String(clueId)} amount={round.ClueCostAmount[idx]} size={7} eventData={eventData} iconData={iconData} />
                          {clue && <span className="text-neutral-700 dark:text-neutral-300">{getLocalizedName(clue.Hintlocalize, i18n.language)}</span>}
                          {clue?.HintUse && (
                            <button
                              onClick={() => setActiveHint(isHintOpen ? null : clueId)}
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
            ))}
          </div>
        )}

        {/* Calculator Tab */}
        {activeTab === 'calculator' && (
          <div className="p-4 rounded-b-lg bg-neutral-50 dark:bg-neutral-800/50 space-y-6 text-sm">
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
                  <span className="text-lg group-hover:scale-110 transition-transform">⚡</span>
                </button>
              )}
            </div>

            {/* Results */}
            {displayResult && (
              <div className="pt-4 border-t dark:border-neutral-700 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base dark:text-neutral-200">{t('resultTitle')}</h3>
                  {hasShopClues && (
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
                    <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('cost')}</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(displayResult.cost).map(([key, amount]) => (
                        <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={11} eventData={eventData} iconData={iconData} />
                      ))}
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/40 p-3 rounded-lg">
                    <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('rewards')}</h4>
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
