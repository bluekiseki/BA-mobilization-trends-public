/**
 * Canonical list of all resource income sources.
 *
 * Adding a new income source:
 *   1. Add an entry to RESOURCE_SOURCES below.
 *   2. If it needs a new TriggerType, add it here and handle it in eventsFromDailySources
 *      or eventsFromContentYields in resourceEventAdapters.ts.
 *   3. Add item metadata to ResourcesPanel's ITEM_META if needed.
 *
 * Spend events are not listed here — they live in purchaseEvents in the store.
 */

export type TriggerType =
  | 'daily-per-date' // user sets amount per date (calendar UI)
  | 'on-content-end'; // fires on ScheduleItem.endTime for matching contentType

export interface ResourceSource {
  id: string;
  labelKey?: string;
  itemKey: string;
  triggerType: TriggerType;
  configurable: true;
  contentType?: string; // 'on-content-end' only: ScheduleItem.id prefix
  weeklyIncomeLimit?: number; // cap on 7-day rolling income total
  inputUnit?: string; // display unit for the calendar input
}

export const RESOURCE_SOURCES: ResourceSource[] = [
  // ── Daily per-date (calendar UI) ─────────────────────────────────────────
  {
    id: 'pvp_daily_coin',
    labelKey: 'Item_8',
    itemKey: 'Item_8',
    triggerType: 'daily-per-date',
    configurable: true,
    inputUnit: 'coins/day',
  },

  // ── On content end (lump sum from schedule) ───────────────────────────────
  {
    id: 'raid_end',
    itemKey: 'Item_7',
    triggerType: 'on-content-end',
    contentType: 'raid',
    configurable: true,
  },
  {
    id: 'eraid_end',
    itemKey: 'Item_70',
    triggerType: 'on-content-end',
    contentType: 'eraid',
    configurable: true,
  },
  {
    id: 'multifloor_end',
    itemKey: 'Item_60',
    triggerType: 'on-content-end',
    contentType: 'multifloor',
    configurable: true,
  },
  // Rare Total Assault Coin
  { id: 'raid_end_premium', itemKey: 'Item_9', triggerType: 'on-content-end' as const, contentType: 'raid', configurable: true as const },
  // Rare Grand Assault Coin
  { id: 'eraid_end_premium', itemKey: 'Item_71', triggerType: 'on-content-end' as const, contentType: 'eraid', configurable: true as const },
];

/** Fast lookup: sourceId → ResourceSource */
export const RESOURCE_SOURCE_BY_ID: Readonly<Record<string, ResourceSource>> = Object.fromEntries(RESOURCE_SOURCES.map((s) => [s.id, s]));
