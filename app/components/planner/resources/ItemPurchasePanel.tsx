// app/components/planner/resources/ItemPurchasePanel.tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { COIN_SHOP_BY_COIN_KEY, type CoinItemId, type CoinShopItem } from '~/data/elephSources';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import { /*monthPurchaseTotal,*/ type ResourcePlanEvent } from '~/utils/resourceTimeline';
import { NumberInput } from '~/components/planner/common/NumberInput';

type RangeBuyParams = {
  gainItemKey: string;
  coinKey: string;
  shopItem: CoinShopItem;
  count: number;
  sourceType: string;
  rangeMin: string;
  rangeMax: string;
  refreshCost?: number;
};

export type PurchasePanelEntry = {
  gainItemKey: string;
  label: string;
  shopItem: CoinShopItem;
  coinKey: string;
  availableFrom?: string;
  sourceType?: string;
  isAtMax: boolean;
};

type StoreActions = {
  purchaseEvents: ResourcePlanEvent[];
  removePurchaseEvent: (id: string) => void;
  removePurchasesInRange: (gainItemKey: string, coinKey: string, rangeMin: string, rangeMax: string) => void;
  setPurchasesForRange: (params: RangeBuyParams) => void;
};

type RenderItemIcon = (key: string, size: number, amount: number) => ReactNode;

function CoinShopCard({
  entry,
  date,
  rangeMin,
  rangeMax,
  renderItemIcon,
  purchaseEvents,
  removePurchaseEvent,
  removePurchasesInRange,
  setPurchasesForRange,
  refreshCost,
}: { entry: PurchasePanelEntry; date: string; rangeMin?: string; rangeMax?: string; renderItemIcon?: RenderItemIcon; refreshCost?: number } & StoreActions) {
  const { t } = useTranslation('resources');
  const { t: t_ui } = useTranslation('ui');
  const { gainItemKey, label, shopItem, coinKey, availableFrom, sourceType, isAtMax } = entry;
  const { gainAmount, costPerBundle, /*tierCostAfterFirst,*/ monthlyLimit, dailyLimit } = shopItem;
  const isRange = !!(rangeMin && rangeMax && rangeMin !== rangeMax);
  // const yearMonth = date.slice(0, 7);
  const locked = !!availableFrom && date.slice(0, 7) < availableFrom;

  const relevant = useMemo(() => purchaseEvents.filter((e) => e.gainItemKey === gainItemKey && e.spendItemKey === coinKey), [purchaseEvents, gainItemKey, coinKey]);
  const onDate = relevant.filter((e) => e.date === date);
  // const bought = monthPurchaseTotal(relevant, yearMonth, gainItemKey, coinKey);
  const monthMax = monthlyLimit !== null ? monthlyLimit * gainAmount : null;

  // const todayGained = onDate.reduce((s, ev) => s + (ev.gainAmount ?? 0), 0);
  // const todayPurchases = gainAmount > 0 ? Math.round(todayGained / gainAmount) : 0;

  const maxCount = Math.min(monthlyLimit !== null ? monthlyLimit : Infinity, dailyLimit != null ? dailyLimit : Infinity);
  const cappedMax = maxCount === Infinity ? 99 : maxCount;
  const canAdd = !locked && !isAtMax && maxCount > 0;

  const [count, setCount] = useState(1);
  const [warning, setWarning] = useState(false);
  useEffect(() => {
    setCount(1);
    setWarning(false);
  }, [date]);

  const handleAdd = () => {
    if (!canAdd) {
      setWarning(true);
      return;
    }
    const capped = Math.min(count, cappedMax);
    if (capped <= 0) return;
    setPurchasesForRange({
      gainItemKey,
      coinKey,
      shopItem,
      count: capped,
      sourceType: sourceType ?? 'coin_shop',
      rangeMin: isRange ? rangeMin : date,
      rangeMax: isRange ? rangeMax : date,
      refreshCost,
    });
    setCount(1);
    setWarning(false);
  };

  const showMonthStats = monthMax !== null;
  const showDailyStats = dailyLimit != null;
  // const cost = computeCost(count, todayPurchases, costPerBundle, tierCostAfterFirst);

  return (
    <div className={`space-y-1 ${isAtMax || locked ? 'opacity-40' : ''}`}>
      {/* Row 1: item + cost */}
      <div className="flex items-center gap-1.5 text-[11px]">
        {renderItemIcon?.(gainItemKey, 10, gainAmount)}
        <span className="flex-1 min-w-0 font-medium text-neutral-700 dark:text-neutral-200 truncate" title={label}>
          {label}
        </span>
        {renderItemIcon?.(coinKey, 6, costPerBundle)}
      </div>
      {/* Row 2: controls + stats */}
      <div className="flex items-center gap-1.5 text-[11px] pl-7">
        {locked ? (
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
            {t('purchasePanel.shopNotOpen', { date: availableFrom ? new Date(availableFrom + '-01').toLocaleDateString('en', { year: 'numeric', month: 'short' }) : availableFrom })}
          </span>
        ) : isAtMax ? (
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{t('purchasePanel.targetReached')}</span>
        ) : (
          <>
            <div className="w-28">
              <NumberInput value={count} onChange={setCount} min={1} max={cappedMax} disabled={!canAdd} narrowButtonType="plus_only" />
            </div>
            {canAdd && (showMonthStats || showDailyStats) && (
              <button
                onClick={() => setCount(cappedMax)}
                className="px-1.5 py-0.5 text-[10px] rounded border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                M
              </button>
            )}
            <button
              disabled={!canAdd}
              onClick={handleAdd}
              className="px-2 py-0.5 text-[10px] rounded bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t_ui('apply')}
            </button>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 flex-1 min-w-0 truncate">
              {/* +{count * gainAmount} · −{cost.toLocaleString()} */}
              {/* {showMonthStats && ` · ${bought}/${monthMax} mo`}
              {showDailyStats && !showMonthStats && ` · ${todayPurchases}/${dailyLimit} day`} */}
              {onDate.map((ev) => (
                <span key={ev.id} className="inline-flex items-center gap-0.5 ml-1">
                  +{ev.gainAmount}
                  <button
                    onClick={() => (isRange ? removePurchasesInRange(gainItemKey, coinKey, rangeMin, rangeMax) : removePurchaseEvent(ev.id))}
                    className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 text-xs font-semibold transition-colors"
                  >
                    {t_ui('cancel')}
                  </button>
                </span>
              ))}
            </span>
            {warning && <span className="text-[10px] text-amber-500 dark:text-amber-400">!</span>}
          </>
        )}
      </div>
    </div>
  );
}

function entryKey(entry: PurchasePanelEntry, i: number): string {
  return `coin_${entry.gainItemKey}_${entry.coinKey}_${i}`;
}

interface Props {
  date: string;
  entries: PurchasePanelEntry[];
  onClose: () => void;
  renderItemIcon?: RenderItemIcon;
  rangeMin?: string;
  rangeMax?: string;
}

export default function ItemPurchasePanel({ date, entries, renderItemIcon, rangeMin, rangeMax }: Props) {
  const { purchaseEvents, removePurchaseEvent, removePurchasesInRange, setPurchasesForRange } = useResourcePlanStore();

  const coinKey: CoinItemId | undefined = entries.length > 0 ? (entries[0].coinKey as CoinItemId) : undefined;
  const refreshCost: number | undefined = coinKey !== undefined ? COIN_SHOP_BY_COIN_KEY[coinKey]?.refreshCost : undefined;

  if (entries.length === 0) return null;

  const storeActions: StoreActions = { purchaseEvents, removePurchaseEvent, removePurchasesInRange, setPurchasesForRange };

  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {entries.map((entry, i) => (
        <CoinShopCard key={entryKey(entry, i)} entry={entry} date={date} rangeMin={rangeMin} rangeMax={rangeMax} renderItemIcon={renderItemIcon} {...storeActions} refreshCost={refreshCost} />
      ))}
    </div>
  );
}
