// src/components/ShopPlanner.tsx
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import HelpTooltip from 'rc-tooltip';
import { HiChevronDown, HiOutlineQuestionMarkCircle } from 'react-icons/hi2';
import { ItemIcon } from '../../../components/item/Icon';
import { NumberInput } from '../../../components/common/NumberInput';
import type { EventData, IconData, IconInfo, Stage, StudentData } from '~/types/plannerData';
import { useEventSettings } from '~/features/event-planner/useSettingsStore';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import { getLocalizeEtcName } from '../../../utils/locale';
import { CustomCheckbox } from '../../../components/common/CustomCheckbox';
import { getCurrentTierPrice } from '../logic/shopTieredCost';
import { getShopItemType } from '~/utils/itemType';
import type { ItemType } from '~/utils/itemType';
import { getEventCommissionMultiplier } from '../logic/commissionMultiplier';
import {
  COMMISSION_AREAS,
  COMMISSION_STAGES,
  CREDIT_ID,
  TOP_REPORT_ID,
  TOP_STONE_ID,
  commissionApValue,
  creditsPerAp,
  enhancementStoneApValue,
  reportApValue,
  shopBenefitRatio,
  slumpiaDropFormula,
  factoryDropFormula,
  factoryRunAp,
  type CommissionArea,
  type CommissionStage,
} from '../logic/shopBenefit';
import { formatCompactNumber } from '~/utils/formatCompactNumber';
import { applyRepeatableEventBonus } from '~/features/event-planner/logic/eventBonus';

interface ShopPlannerProps {
  eventId: number;
  eventData: EventData;
  shop: NonNullable<EventData['shop']>;
  iconData: IconData;
  allStages: (Stage & { type: 'stage' | 'story' | 'challenge' })[]; // Receiving stage data from FarmingPlanner
  totalBonus: Record<number, number>; // Receive bonus data from BonusSelector
  allStudents?: StudentData;
}

const DEFAULT_COMMISSION_MULTIPLIER = 2;
const DEFAULT_COMMISSION_LEVEL = 'N';
interface BenefitRatios {
  /** Currency priced by the stage's own share of the drops. */
  share: number;
  /** Currency priced by the total AP spent per currency obtained. */
  total: number | null;
}
interface BenefitRow {
  itemName: string;
  summaryName: string;
  ratios: BenefitRatios;
  currencyId: number;
  stage: CommissionStage;
}
const COMMISSION_MULTIPLIER_CHOICES = [1, 2, 3];
const formatApValue = (value: number, locale: string) => value.toLocaleString(locale, { maximumFractionDigits: 4 });
// Stage names end in StageNN; fall back to the id when they do not.
const stageNumber = (stage: Stage) => /Stage(\d+)$/.exec(stage.Name)?.[1]?.replace(/^0+/, '') || String(stage.Id);

export const ShopPlanner = ({ eventId, shop, eventData, iconData, allStages, totalBonus, allStudents }: ShopPlannerProps) => {
  const { shopActiveTab: activeTab, setShopActiveTab: setActiveTab, shopDisplayUnit: displayUnit, setShopDisplayUnit: setDisplayUnit } = useEventSettings(eventId);

  const { plan, setPurchaseCounts, setAlreadyPurchasedCounts } = usePlanForEvent(eventId);
  const { purchaseCounts, alreadyPurchasedCounts } = plan;

  const { t, i18n } = useTranslation('planner');
  const { t: t_g } = useTranslation('game');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;

  useEffect(() => {
    if (!activeTab) {
      const categories = Object.keys(shop);
      setActiveTab(categories[0]);
    }
  }, [shop]);

  // 2. Highest efficiency AP cost calculation by event goods
  const currencyApInfo = useMemo(() => {
    const apMap: Record<number, number> = {};
    const bestStageMap: Record<number, Stage> = {};
    // Total AP spent per currency obtained, with every other drop of the stage ignored.
    const totalApMap: Record<number, number> = {};
    const totalStageMap: Record<number, Stage> = {};
    const eventCurrencyIds = new Set(eventData.currency?.map((c) => c.ItemUniqueId));

    eventCurrencyIds.forEach((currencyId) => {
      let bestApPerItem = Infinity;
      let bestTotalApPerItem = Infinity;

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
        const effectiveDropAmount = applyRepeatableEventBonus(baseDropAmount, bonusPercent);

        if (effectiveDropAmount > 0) {
          const totalApPerItem = stage.StageEnterCostAmount / effectiveDropAmount;
          if (totalApPerItem < bestTotalApPerItem) {
            bestTotalApPerItem = totalApPerItem;
            totalStageMap[currencyId] = stage;
          }
          const apPerItem = (stage.StageEnterCostAmount * (baseDropAmount / totalRewardSum)) / effectiveDropAmount;
          if (apPerItem < bestApPerItem) {
            bestApPerItem = apPerItem;
            bestStageMap[currencyId] = stage;
          }
        }
      }
      apMap[currencyId] = bestApPerItem === Infinity ? 0 : bestApPerItem;
      totalApMap[currencyId] = bestTotalApPerItem === Infinity ? 0 : bestTotalApPerItem;
    });
    return { apMap, bestStageMap, totalApMap, totalStageMap };
  }, [allStages, eventData, totalBonus]);
  const currencyApCostMap = currencyApInfo.apMap;

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

  /* Previous select-all logic (replaced by toggleTypeSelection) */

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
      { label: t_g('report'), type: 'ExpGrowth' as const },
      { label: t_g('equipment'), type: 'Equipment' as const },
      { label: t('label.tacticalBD'), type: 'TacticalBD' as const },
      { label: t('label.techNote'), type: 'TechNote' as const },
      { label: t_g('opart'), type: 'Opart' as const },
      { label: t('label.material'), type: 'Material' as const },
      { label: t_g('gift'), type: 'Favor' as const },
      { label: t('label.furniture'), type: 'Furniture' as const },
      { label: t_g('credit'), type: 'Credit' as const },
      { label: t_g('coin'), type: 'Coin' as const },
      { label: t_g('eleph'), type: 'SecretStone' as const },
      { label: t_g('pyroxene'), type: 'Gem' as const },
    ],
    [t],
  );

  const categorySelectionStates = useMemo(() => {
    if (!activeTab) return {};

    const itemsInCategory = shop[activeTab];
    // { ExpGrowth: { totalEligible: 5, totalSelected: 2 }, ... }
    // sample: example icon on the checkbox, picked by highest rarity first, then largest amount.
    const states: Record<string, { totalEligible: number; totalSelected: number; firstIndex: number; sample?: { type: string; id: string; rarity: number; amount: number } }> = {};

    // 1. Initialize state object for all button types
    itemTypeButtons.forEach((btn) => {
      states[btn.type] = { totalEligible: 0, totalSelected: 0, firstIndex: Infinity };
    });

    // 2. Iterate through current category items and calculate state
    for (const [index, item] of itemsInCategory.entries()) {
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
          states[itemType].firstIndex = Math.min(states[itemType].firstIndex, index);
          const rarity = (itemInfo as IconInfo | undefined)?.Rarity ?? 0;
          const amount = goodsInfo.ParcelAmount[0];
          const current = states[itemType].sample;
          if (!current || rarity > current.rarity || (rarity === current.rarity && amount > current.amount)) {
            states[itemType].sample = { type: rewardType, id: rewardId.toString(), rarity, amount };
          }

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

  // A Commission campaign (3x) overlapping the event's run raises the credit drop rate.
  const commissionMultiplier = useMemo(() => getEventCommissionMultiplier(eventId, DEFAULT_COMMISSION_MULTIPLIER), [eventId]);

  // Which Commission the shop is compared against; the schedule picks the multiplier unless the user chooses one.
  const [benefitOpen, setBenefitOpen] = useState(false);
  const [benefitSettingsOpen, setBenefitSettingsOpen] = useState(false);
  const [benefitHelpOpen, setBenefitHelpOpen] = useState(false);
  const benefitId = useId();
  const [multiplierChoice, setMultiplierChoice] = useState<number | null>(null);
  const [stageChoices, setStageChoices] = useState<Partial<Record<CommissionArea, string>>>({});
  const multiplier = multiplierChoice ?? commissionMultiplier;

  const apConversion = useMemo(() => {
    if (!activeTab) return null;

    const itemsInCurrentCategory = shop[activeTab];

    let hasReports = false;
    const hasCommissionItem: Record<string, boolean> = {};
    const benefitRows = new Map<string, BenefitRow>();
    let hasEnhancementStones = false;
    let hasInfiniteCreditPurchase = false;
    let hasPricedItem = false;

    for (const item of itemsInCurrentCategory) {
      if (item.Goods) {
        const goodsInfo = item.Goods[0];
        const rewardId = goodsInfo.ParcelId[0];
        const rewardType = goodsInfo.ParcelTypeStr[0];
        const itemInfo = eventData.icons[rewardType]?.[rewardId.toString()];

        // Simplify logic by calling helper function
        const currentItemType = getShopItemType(rewardType, rewardId, itemInfo);
        const costCurrencyId = goodsInfo.ConsumeParcelId[0];
        const apPerCurrency = currencyApCostMap[costCurrencyId];
        if (apPerCurrency) hasPricedItem = true;
        const reward = { itemType: currentItemType, rewardType, rewardId, amount: goodsInfo.ParcelAmount[0] };
        const candidates = COMMISSION_STAGES.flatMap((candidateStage) => {
          const commissionAp = commissionApValue(candidateStage, multiplier, reward);
          return commissionAp === null ? [] : [{ stage: candidateStage, commissionAp }];
        });
        for (const candidate of candidates) hasCommissionItem[candidate.stage.id] = true;
        // Only the goods the notices talk about are compared: credits sold without limit, the top-tier stone and the top-tier report.
        const isCompared =
          (rewardType === 'Currency' && rewardId === CREDIT_ID && item.PurchaseCountLimit === 0) ||
          (rewardType === 'Equipment' && rewardId === TOP_STONE_ID) ||
          (currentItemType === 'ExpGrowth' && rewardId === TOP_REPORT_ID);
        // The Commission stage the user picked per area (N unless changed) is what the shop is compared against.
        const top = candidates.find((candidate) => candidate.stage.level === (stageChoices[candidate.stage.area] ?? DEFAULT_COMMISSION_LEVEL));
        if (isCompared && apPerCurrency && top) {
          const cost = goodsInfo.ConsumeParcelAmount[0];
          const totalApPerCurrency = currencyApInfo.totalApMap[costCurrencyId];
          const ratiosFor = (commissionAp: number): BenefitRatios | null => {
            const share = shopBenefitRatio(commissionAp, cost, apPerCurrency);
            return share === null ? null : { share, total: totalApPerCurrency ? shopBenefitRatio(commissionAp, cost, totalApPerCurrency) : null };
          };
          const ratios = ratiosFor(top.commissionAp);
          const rowKey = `${rewardType}-${rewardId}`;
          if (ratios && ratios.share > (benefitRows.get(rowKey)?.ratios.share ?? 0)) {
            const itemName =
              rewardType === 'Currency' && rewardId === CREDIT_ID ? `${formatCompactNumber(goodsInfo.ParcelAmount[0])} ${t_g('credit')}` : getLocalizeEtcName(item.LocalizeEtc, locale) || '';
            const summaryName = rewardType === 'Currency' ? t('ui.shopBenefitItem_credit') : rewardType === 'Equipment' ? t('ui.shopBenefitItem_stone') : t('ui.shopBenefitItem_report');
            benefitRows.set(rowKey, { itemName, summaryName, ratios, currencyId: costCurrencyId, stage: top.stage });
          }
        }
        // Only when the payment currency has an AP price, i.e. the item is not shown as NA.
        if (rewardType === 'Currency' && rewardId === CREDIT_ID && item.PurchaseCountLimit === 0 && currencyApCostMap[goodsInfo.ConsumeParcelId[0]]) hasInfiniteCreditPurchase = true;
        if (currentItemType == 'Equipment') hasEnhancementStones = true;
        else if (currentItemType == 'ExpGrowth') hasReports = true;
      }
    }

    // The notices below follow the stage the benefit is measured against.
    const rows = [...benefitRows.values()].sort((left, right) => right.ratios.share - left.ratios.share);
    const noticeStage: CommissionStage = COMMISSION_STAGES.find((stage) => stage.area === rows[0]?.stage.area && stageChoices[stage.area] === stage.level) ??
      rows[0]?.stage ?? { id: 'slumpia-N', area: 'slumpia', level: 'N' };
    const area: CommissionArea = noticeStage.area;
    const factoryLevel = noticeStage.area === 'factory' ? noticeStage.level : 'N';
    const slumpiaLevel = noticeStage.area === 'slumpia' ? noticeStage.level : 'N';

    // Nothing in this tab has an AP price (every cost shows NA), so there is nothing to explain.
    if (!hasPricedItem) return null;

    const details = (
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
        {hasReports && area === 'factory' && (
          <div className="text-xs text-amber-700 dark:text-amber-400 border-t border-amber-200 dark:border-amber-800 pt-2 mt-2">
            {/* Previous standard retained for reference.
            <div className="line-through opacity-70">
              <p>
                <strong>{t('ui.reportNoticeTitle')}</strong>
              </p>
              <p className="font-mono text-[10px] opacity-80">{t('ui.reportNoticeFormula')}</p>
            </div>
            */}

            <p>
              <strong>{t('ui.reportNoticeUpcomingTitle', { multiplier, level: factoryLevel, ap: formatApValue(reportApValue(multiplier, factoryLevel), locale) })}</strong>
            </p>
            <p className="font-mono text-[10px] opacity-80">{t('ui.reportNoticeUpcomingFormula', { multiplier, runAp: factoryRunAp(factoryLevel), drops: factoryDropFormula(factoryLevel) })}</p>
          </div>
        )}

        {/* 3. a phrase related to EnhancementStones */}
        {hasEnhancementStones && area === 'slumpia' && (
          <div className="text-xs text-amber-700 dark:text-amber-400 border-t border-amber-200 dark:border-amber-800 pt-2 mt-2">
            {/* Previous standard retained for reference.
            <div className="line-through opacity-70">
              <p>
                <strong>{t('ui.enhancementStoneNoticeTitle')}</strong>
              </p>
              <p className="font-mono text-[10px] opacity-80">{t('ui.enhancementStoneNoticeFormula')}</p>
            </div>
            */}

            <p>
              <strong>{t('ui.enhancementStoneNoticeUpcomingTitle', { multiplier, level: slumpiaLevel, ap: formatApValue(enhancementStoneApValue(multiplier, slumpiaLevel), locale) })}</strong>
            </p>
            <p className="font-mono text-[10px] opacity-80">{t('ui.enhancementStoneNoticeUpcomingFormula', { multiplier, drops: slumpiaDropFormula(slumpiaLevel) })}</p>
          </div>
        )}

        {/* 4. Credits can be bought without limit, so show what they are worth in AP */}
        {hasInfiniteCreditPurchase && area === 'slumpia' && (
          <div className="text-xs text-amber-700 dark:text-amber-400 border-t border-amber-200 dark:border-amber-800 pt-2 mt-2">
            <p>
              <strong>
                {t('ui.creditApValueNoticeTitle', {
                  multiplier,
                  level: slumpiaLevel,
                  credits: Math.round(creditsPerAp(multiplier, slumpiaLevel)).toLocaleString(locale),
                  ap: (50_000 / creditsPerAp(multiplier, slumpiaLevel)).toLocaleString(locale, { maximumFractionDigits: 2 }),
                })}
              </strong>
            </p>
            <p className="font-mono text-[10px] opacity-80">
              {t('ui.creditApValueNoticeFormula', { multiplier, drops: slumpiaDropFormula(slumpiaLevel), credits: Math.round(creditsPerAp(multiplier, slumpiaLevel)).toLocaleString(locale) })}
            </p>
          </div>
        )}
      </div>
    );

    // Compare the best item in each farming scenario, using the displayed precision.
    const bestRatios = [
      rows.length ? Math.max(...rows.map((row) => row.ratios.share)) : null,
      rows.some((row) => row.ratios.total !== null) ? Math.max(...rows.flatMap((row) => (row.ratios.total === null ? [] : [row.ratios.total]))) : null,
    ]
      .filter((ratio): ratio is number => ratio !== null)
      .map((ratio) => Math.round(ratio * 100) / 100);
    const rating: 'good' | 'normal' | 'low' =
      bestRatios.length > 0 && bestRatios.every((ratio) => ratio > 1) ? 'good' : bestRatios.length > 0 && bestRatios.every((ratio) => ratio < 1) ? 'low' : 'normal';

    const bestTotalRow = rows.reduce<BenefitRow | undefined>(
      (best, row) => (row.ratios.total !== null && (best?.ratios.total == null || row.ratios.total > best.ratios.total) ? row : best),
      undefined,
    );
    const summaryItems = [...new Set([rows[0]?.summaryName, bestTotalRow?.summaryName].filter((name): name is string => Boolean(name)))].join(' / ');
    return { details, area, rows, hasCommissionItem, rating, summaryItems };
  }, [activeTab, eventData, locale, multiplier, stageChoices, currencyApCostMap, shop, t, t_g]);

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

      {apConversion && apConversion.rows.length > 0 && (
        <section data-component-name="ShopPlanner_apbanner" className="mb-3 border-b border-neutral-200 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-300">
          <div className="flex items-center gap-1 py-1">
            <button
              type="button"
              aria-expanded={benefitOpen}
              aria-controls={benefitId}
              onClick={() => setBenefitOpen((open) => !open)}
              className="flex min-h-9 min-w-0 items-center gap-1.5 text-left text-xs font-semibold focus-visible:outline-2"
            >
              <HiChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 transition-transform ${benefitOpen ? '' : '-rotate-90'}`} />
              <span>
                {t('ui.shopBenefitTitle', { multiplier, item: apConversion.summaryItems })}
                <span
                  className={`whitespace-nowrap ${apConversion.rating === 'good' ? 'text-green-700 dark:text-green-400' : apConversion.rating === 'low' ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-600 dark:text-neutral-300'}`}
                >
                  {' '}
                  · {t(`ui.shopBenefitRating_${apConversion.rating}`)}
                </span>
              </span>
            </button>
            <HelpTooltip
              id={`${benefitId}-help`}
              placement="bottom"
              trigger={['hover', 'focus', 'click']}
              visible={benefitHelpOpen}
              onVisibleChange={setBenefitHelpOpen}
              styles={{ body: { boxShadow: 'none', minHeight: 'auto' } }}
              overlay={<p className="w-56 text-xs leading-relaxed">{t('ui.shopBenefitHint')}</p>}
            >
              <button
                type="button"
                aria-label={t('ui.shopBenefitHelp')}
                aria-describedby={benefitHelpOpen ? `${benefitId}-help` : undefined}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setBenefitHelpOpen(false);
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-900 focus-visible:outline-2 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                <HiOutlineQuestionMarkCircle className="h-4 w-4" aria-hidden="true" />
              </button>
            </HelpTooltip>
            {benefitOpen && (
              <button
                type="button"
                aria-expanded={benefitSettingsOpen}
                aria-controls={`${benefitId}-settings`}
                onClick={() => setBenefitSettingsOpen((open) => !open)}
                className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1 px-1 text-xs text-neutral-500 hover:text-neutral-900 focus-visible:outline-2 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                <HiChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 transition-transform ${benefitSettingsOpen ? '' : '-rotate-90'}`} />
                {t('ui.shopBenefitSettings')}
              </button>
            )}
          </div>
          <div id={benefitId} hidden={!benefitOpen} className="pb-3">
            {apConversion.rows.length ? (
              <>
                {(() => {
                  const formatRatio = (ratio: number) => t('ui.shopBenefitRatio', { value: ratio.toLocaleString(locale, { maximumFractionDigits: 2 }) });
                  const ratioClass = (ratio: number) =>
                    `flex items-center justify-between gap-3 px-2 py-1 font-bold tabular-nums sm:table-cell sm:border-t sm:border-neutral-200 sm:py-2 sm:text-right dark:sm:border-neutral-700 ${ratio > 1 ? 'text-green-700 dark:text-green-400' : 'text-neutral-700 dark:text-neutral-300'}`;
                  const shareStage = currencyApInfo.bestStageMap[apConversion.rows[0].currencyId];
                  const totalStage = currencyApInfo.totalStageMap[apConversion.rows[0].currencyId];
                  const headClass = 'px-2 py-1 text-right font-normal text-neutral-600 dark:text-neutral-400';
                  return (
                    <table className="mt-1 block w-full border-collapse sm:table sm:w-auto">
                      <thead className="hidden sm:table-header-group">
                        <tr>
                          <th className="px-3 py-1" />
                          {shareStage && <th className={headClass}>{t('ui.shopBenefitByShare', { stage: stageNumber(shareStage) })}</th>}
                          {totalStage && <th className={headClass}>{t('ui.shopBenefitByTotal', { stage: stageNumber(totalStage) })}</th>}
                        </tr>
                      </thead>
                      <tbody className="block sm:table-row-group">
                        {apConversion.rows.map((row) => (
                          <tr key={row.itemName} className="block border-t border-neutral-200 py-2 dark:border-neutral-700 sm:table-row sm:border-0 sm:py-0">
                            <th className="block px-2 py-1 text-left font-semibold sm:table-cell sm:border-t sm:border-neutral-200 dark:sm:border-neutral-700">{row.itemName}</th>
                            {shareStage && (
                              <td className={ratioClass(row.ratios.share)}>
                                <span className="font-normal text-neutral-500 dark:text-neutral-400 sm:hidden">{t('ui.shopBenefitByShare', { stage: stageNumber(shareStage) })}</span>
                                {formatRatio(row.ratios.share)}
                              </td>
                            )}
                            {totalStage && (
                              <td className={ratioClass(row.ratios.total ?? row.ratios.share)}>
                                <span className="font-normal text-neutral-500 dark:text-neutral-400 sm:hidden">{t('ui.shopBenefitByTotal', { stage: stageNumber(totalStage) })}</span>
                                {row.ratios.total === null ? '-' : formatRatio(row.ratios.total)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </>
            ) : (
              <p>{t('ui.shopBenefitNone')}</p>
            )}
            <div id={`${benefitId}-settings`} hidden={!benefitSettingsOpen} className="mt-3 border-t border-neutral-200 pt-2 dark:border-neutral-700">
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="flex items-center gap-1">
                    <span>{t('ui.shopBenefitMultiplier')}</span>
                    {COMMISSION_MULTIPLIER_CHOICES.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => setMultiplierChoice(choice === commissionMultiplier ? null : choice)}
                        className={`rounded border px-1.5 py-0.5 ${multiplier === choice ? 'border-amber-500 bg-amber-100 dark:bg-amber-800/60' : 'border-neutral-300 dark:border-neutral-600'}`}
                      >
                        {t('ui.shopBenefitMultiplierValue', { n: choice })}
                      </button>
                    ))}
                  </div>
                  {COMMISSION_AREAS.filter((area) => COMMISSION_STAGES.some((stage) => stage.area === area && apConversion.hasCommissionItem[stage.id])).map((area) => (
                    <label key={area} className="flex items-center gap-1">
                      <span>{t(`ui.shopBenefitArea_${area}`)}</span>
                      <select
                        value={stageChoices[area] ?? DEFAULT_COMMISSION_LEVEL}
                        onChange={(event) => setStageChoices((previous) => ({ ...previous, [area]: event.target.value }))}
                        className="rounded border border-neutral-300 bg-white px-1 py-0.5 dark:border-neutral-600 dark:bg-neutral-900"
                      >
                        {COMMISSION_STAGES.filter((stage) => stage.area === area).map((stage) => (
                          <option key={stage.id} value={stage.level}>
                            {stage.level}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {apConversion.details}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="space-y-6">
        {shopCategories.map(([categoryId, items]) => {
          // console.log('shop - activeTab', activeTab);
          if (activeTab !== categoryId) return null; // Render only the active tab

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
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex flex-wrap gap-2">
                  {filteredButtons
                    .filter((btn) => categorySelectionStates[btn.type].totalEligible)
                    // Order by where each type first appears in the shop.
                    .sort((a, b) => categorySelectionStates[a.type].firstIndex - categorySelectionStates[b.type].firstIndex)
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
                          ${isDisabled ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer'}`}
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
                          {stateInfo.sample && iconData[stateInfo.sample.type]?.[stateInfo.sample.id] && (
                            <img src={`data:image/webp;base64,${iconData[stateInfo.sample.type][stateInfo.sample.id]}`} alt="" className="-ml-0.5 -mr-1.5 -my-1.5 h-6 w-6 object-contain" />
                          )}
                          <span>{btn.label}</span>
                        </label>
                      );
                    })}
                </div>

                <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                  <button
                    onClick={() => handleSelectAllInCategory(categoryId)}
                    className="whitespace-nowrap bg-ba-btn-blue hover:bg-ba-btn-blue-dark text-neutral-900 font-bold text-xs py-1 px-2 rounded-md"
                  >
                    {' '}
                    {t('button.purchaseCurrentTab')}
                  </button>
                  <button onClick={() => handleResetCategory(categoryId)} className="whitespace-nowrap bg-ba-btn-gray hover:bg-neutral-300 text-neutral-900 font-bold text-xs py-1 px-2 rounded-md">
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
                                <label className="text-[10px] text-neutral-500 dark:text-neutral-400 font-semibold">{t_ui('owned')}</label>
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
