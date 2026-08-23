/* Canonical resource income sources (spend events in store) */

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
