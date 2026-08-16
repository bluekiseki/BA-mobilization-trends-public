// hooks/planner/useCalendarSources.ts
import { useCallback, useMemo } from 'react';
import type { CalendarSource } from '~/components/planner/shared/UnifiedPlanCalendar';
import type { ResourcePlanEvent, StageFarmingPlan } from '~/types/resourcePlan';
import type { CampaignData, IconInfos } from '~/types/plannerData';
import { COIN_SHOP_BY_COIN_KEY } from '~/data/elephSources';
import type { CoinItemId } from '~/data/elephSources';
import { getItemName } from '~/components/planner/common/locale';
import type { Locale } from '~/utils/i18n/config';
import type { TrackingItem } from '~/components/planner/resources/ResourcePanel';

// Derive types directly from the store hook — never invent exports that don't exist.
// type StoreState = ReturnType<typeof useResourcePlanStore>;
type PurchaseEvents = ResourcePlanEvent[];
// type PurchaseEvents = StoreState['purchaseEvents'];
type StageFarmingPlans = Record<string, StageFarmingPlan>; //StoreState['stageFarmingPlans'];

interface UseCalendarSourcesOptions {
  trackingItems: TrackingItem[];
  purchaseEvents: PurchaseEvents;
  stageFarmingPlans: StageFarmingPlans;
  campaigns: { jp: CampaignData; kr: CampaignData } | null;
  server: 'kr' | 'jp';
  selectedItemKey: string | null;
  itemIconInfo: IconInfos | null;
  locale: Locale;
  setStageFarmingRunsRange: (key: string, start: string, end: string, value: number) => void;
  removeStageFarmingPlan: (key: string) => void;
  setSelectedPurchaseDate: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useCalendarSources({
  trackingItems,
  purchaseEvents,
  stageFarmingPlans,
  campaigns,
  server,
  selectedItemKey,
  itemIconInfo,
  locale,
  setStageFarmingRunsRange,
  removeStageFarmingPlan,
  setSelectedPurchaseDate,
}: UseCalendarSourcesOptions) {
  const buildSources = useCallback(
    (itemsToTrack: string[], selectedIKey: string | null): CalendarSource[] => {
      const sources: CalendarSource[] = [];

      for (const itemKey of itemsToTrack) {
        if (itemKey === 'Currency_18') {
          const eligmaPermitValues: Record<string, number> = {};
          for (const ev of purchaseEvents) {
            if (ev.gainItemKey === 'Item_23' && ev.sourceType === 'expert_permit_exchange' && ev.gainAmount) {
              eligmaPermitValues[ev.date] = (eligmaPermitValues[ev.date] ?? 0) + ev.gainAmount;
            }
          }
          sources.push({
            key: 'expert_permit_eligma',
            itemKey: 'Currency_18',
            label: 'Eligma (Expert Permit)',
            values: eligmaPermitValues,
            onDateClick: (date) => setSelectedPurchaseDate((prev) => (prev === date ? null : date)),
            valueLabel: 'eligma',
          });
        } else if (itemKey.startsWith('Item_')) {
          const vals: Record<string, number> = {};
          for (const ev of purchaseEvents) {
            if (ev.gainItemKey === itemKey && ev.gainAmount) {
              vals[ev.date] = (vals[ev.date] ?? 0) + ev.gainAmount;
            }
          }
          sources.push({
            key: `coin_item_${itemKey}`,
            itemKey,
            label: getItemName(itemKey, itemIconInfo, locale),
            values: vals,
            onDateClick: (date) => setSelectedPurchaseDate((prev) => (prev === date ? null : date)),
            valueLabel: 'eleph',
          });
        }
      }

      for (const [key, plan] of Object.entries(stageFarmingPlans)) {
        const stage = campaigns?.[server]?.[key];
        if (!stage) continue;
        sources.push({
          key,
          label: stage.Name,
          values: plan.dailyRuns,
          onApplyRange: (s, e, v) => setStageFarmingRunsRange(key, s, e, v),
          onRemove: () => removeStageFarmingPlan(key),
          valueLabel: 'runs/day',
          maxValue: 6,
          apCostPerUnit: 20,
        });
      }

      const coinShopDef = selectedIKey ? COIN_SHOP_BY_COIN_KEY[selectedIKey as CoinItemId] : undefined;
      if (coinShopDef) {
        const addedItemKeys = new Set<string>(sources.map((s) => s.itemKey).filter((k): k is string => !!k));
        for (const item of coinShopDef.items) {
          if (addedItemKeys.has(item.gainItemKey)) continue;
          const vals: Record<string, number> = {};
          for (const ev of purchaseEvents) {
            if (ev.gainItemKey === item.gainItemKey && ev.gainAmount) {
              vals[ev.date] = (vals[ev.date] ?? 0) + ev.gainAmount;
            }
          }
          sources.push({
            key: `coin_item_${item.gainItemKey}`,
            itemKey: item.gainItemKey,
            label: getItemName(item.gainItemKey, itemIconInfo, locale),
            values: vals,
            onDateClick: (date) => setSelectedPurchaseDate((prev) => (prev === date ? null : date)),
            valueLabel: 'eleph',
          });
          addedItemKeys.add(item.gainItemKey);
        }
        sources.push({
          key: `coin_panel_${selectedIKey}`,
          itemKey: selectedIKey ?? undefined,
          label: '',
          values: {},
          hidden: true,
          onDateClick: (date) => setSelectedPurchaseDate((prev) => (prev === date ? null : date)),
          valueLabel: '',
        });
      }

      return sources;
    },
    [purchaseEvents, stageFarmingPlans, campaigns, server, itemIconInfo, locale, setStageFarmingRunsRange, removeStageFarmingPlan, setSelectedPurchaseDate],
  );

  const allCalendarSources = useMemo(
    () =>
      buildSources(
        trackingItems.map((t) => t.key),
        selectedItemKey,
      ),
    [buildSources, trackingItems, selectedItemKey],
  );

  return { allCalendarSources, buildSources };
}
