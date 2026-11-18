import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import type { EventPlan } from '~/types/eventPlan';

export type IncomeKind = 'event' | 'eventFixed' | 'raid' | 'eraid' | 'multifloor' | 'coinShop';

/** Where event income comes from: the user's saved event plans, or everything the events sell and pay out except stage drops. */
export type EventIncomeMode = 'planner' | 'all';
export const DEFAULT_EVENT_INCOME_MODE: EventIncomeMode = 'planner';

/**
 * Sources whose full reward can be assumed to be collected even though the user has not planned it.
 * Applies to every item the source grants; `defaultOn` is used until the user chooses.
 */
export const ASSUMABLE_INCOME_SOURCES: ReadonlyArray<{ id: 'raid' | 'eraid'; defaultOn: boolean }> = [
  { id: 'raid', defaultOn: true },
  { id: 'eraid', defaultOn: true },
];

export type IncomeAssumptions = Record<string, boolean>;

export function isIncomeAssumed(assumptions: IncomeAssumptions | undefined, id: 'raid' | 'eraid'): boolean {
  return assumptions?.[id] ?? ASSUMABLE_INCOME_SOURCES.find((source) => source.id === id)?.defaultOn ?? false;
}

/** One expected acquisition of an item from a dated source (event plan or raid season reward). */
export interface ItemIncome {
  id: string;
  kind: IncomeKind;
  name: string;
  date: string;
  amount: number;
  prediction: boolean;
}

export type IncomeByKey = Record<string, ItemIncome[]>;

/** Cumulative score threshold and the items granted when it is reached. */
export type SeasonMilestones = Array<[number, Record<string, number>]>;

export type RewardServer = 'kr' | 'jp';

/**
 * Season rewards are exported by the JP schedule's season number. The KR schedule runs behind it,
 * so a KR season maps to the JP season that has the same boss and rewards.
 */
const SCHEDULE_SEASON_OFFSET: Record<RewardServer, Record<'raid' | 'eraid' | 'multifloor', number>> = {
  jp: { raid: 0, eraid: 0, multifloor: 0 },
  kr: { raid: 3, eraid: 0, multifloor: 0 },
};

function rewardSeasonKey(item: ScheduleItemV2, kind: 'raid' | 'eraid' | 'multifloor', server: RewardServer): string | null {
  return item.season === undefined ? null : String(item.season + SCHEDULE_SEASON_OFFSET[server][kind]);
}

/** coin item key -> itemKey -> amount obtained, and coins spent, by buying every limited good of the shop's monthly lineup (refreshed on the 1st). */
export type CoinShopMonthly = Record<string, Record<string, { amount: number; cost: number }>>;

/** Season -> floor number -> items granted for clearing that floor. */
export type MultifloorRewards = Record<string, Record<string, Record<string, number>>>;

/** eventId -> itemKey -> amount from buying every limited shop good plus mission rewards (no stage drops). */
export type EventFixedTotals = Record<string, Record<string, number>>;

/** Season -> score milestones, per raid kind. */
export interface RaidSeasonRewards {
  raid: Record<string, SeasonMilestones>;
  eraid: Record<string, SeasonMilestones>;
}

export interface EventDropEntry {
  /** Event id. */
  e: number;
  /** Stage group in the event data (stage / story / challenge). */
  g: string;
  /** Stage number. */
  n: string;
  /** Drop probability out of 10000. */
  p: number;
}

export type EventDropIndex = Record<string, EventDropEntry[]>;

export interface EventDropSource {
  eventId: number;
  name: string;
  date: string;
  prediction: boolean;
  /** Best drop of the item inside this event. */
  stage: EventDropEntry;
}

type PlanCache = { cachedTotalItems?: EventPlan['cachedTotalItems'] };

/** Event ids in the plan store and the drop index are the schedule id without the rerun offset. */
export function scheduleEventId(item: ScheduleItemV2): number | null {
  const raw = parseInt(item.id.replace('event-', ''));
  return isNaN(raw) ? null : raw % 100000;
}

function isUpcoming(item: ScheduleItemV2, today: string): boolean {
  return (item.endTime ?? item.startTime).slice(0, 10) >= today;
}

function addIncome(result: IncomeByKey, key: string, income: ItemIncome) {
  if (income.amount <= 0) return;
  (result[key] ??= []).push(income);
}

function sortIncomes(result: IncomeByKey): IncomeByKey {
  for (const list of Object.values(result)) list.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

/** Items the user's saved event plans are expected to yield, for events that have not ended. */
export function buildEventIncome(eventPlans: Record<string, PlanCache>, events: ScheduleItemV2[], today: string, getTitle: (item: ScheduleItemV2) => string): IncomeByKey {
  const result: IncomeByKey = {};
  for (const item of events) {
    if (!isUpcoming(item, today)) continue;
    const eventId = scheduleEventId(item);
    const gained = eventId === null ? undefined : eventPlans[String(eventId)]?.cachedTotalItems?.gained;
    if (!gained) continue;
    for (const [key, value] of Object.entries(gained)) {
      addIncome(result, key, { id: item.id, kind: 'event', name: getTitle(item), date: item.startTime.slice(0, 10), amount: value.amount ?? 0, prediction: !!item.details?.prediction });
    }
  }
  return sortIncomes(result);
}

/** Season score rewards of raids that have not ended, assuming every cumulative milestone is reached. `skipKeys` are items another model already covers. */
export function buildRaidIncome(
  rewards: RaidSeasonRewards,
  raidItems: ScheduleItemV2[],
  today: string,
  getTitle: (item: ScheduleItemV2) => string,
  options: { server: RewardServer; kinds?: ReadonlySet<'raid' | 'eraid'>; skipKeys?: ReadonlySet<string> },
): IncomeByKey {
  const result: IncomeByKey = {};
  for (const item of raidItems) {
    const kind = item.id.startsWith('raid-') ? 'raid' : item.id.startsWith('eraid-') ? 'eraid' : null;
    if (!kind || !isUpcoming(item, today) || (options.kinds && !options.kinds.has(kind))) continue;
    const seasonKey = rewardSeasonKey(item, kind, options.server);
    const milestones = seasonKey === null ? undefined : rewards[kind][seasonKey];
    if (!milestones) continue;
    for (const [key, amount] of Object.entries(sumMilestones(milestones))) {
      if (options.skipKeys?.has(key)) continue;
      addIncome(result, key, { id: item.id, kind, name: getTitle(item), date: (item.endTime ?? item.startTime).slice(0, 10), amount, prediction: !!item.details?.prediction });
    }
  }
  return sortIncomes(result);
}

/** Shop goods and mission rewards of every event that has not ended, whether or not the user planned it. */
export function buildEventFixedIncome(totals: EventFixedTotals, events: ScheduleItemV2[], today: string, getTitle: (item: ScheduleItemV2) => string): IncomeByKey {
  const result: IncomeByKey = {};
  for (const item of events) {
    if (!isUpcoming(item, today)) continue;
    const eventId = scheduleEventId(item);
    for (const [key, amount] of Object.entries(eventId === null ? {} : (totals[String(eventId)] ?? {}))) {
      addIncome(result, key, { id: item.id, kind: 'eventFixed', name: getTitle(item), date: item.startTime.slice(0, 10), amount, prediction: !!item.details?.prediction });
    }
  }
  return sortIncomes(result);
}

/** Items granted for clearing every floor up to `maxFloor` in the multifloor season of the schedule item. */
export function multifloorSeasonTotals(rewards: MultifloorRewards, item: ScheduleItemV2, server: RewardServer, maxFloor: number): Record<string, number> {
  const seasonKey = rewardSeasonKey(item, 'multifloor', server);
  const floors = seasonKey === null ? undefined : rewards[seasonKey];
  const totals: Record<string, number> = {};
  for (const [floor, items] of Object.entries(floors ?? {})) {
    if (Number(floor) > maxFloor) continue;
    for (const [key, amount] of Object.entries(items)) totals[key] = (totals[key] ?? 0) + amount;
  }
  return totals;
}

/** Floor clear rewards of multifloor seasons that have not ended, summed up to the floor the user plans to reach. */
export function buildMultifloorIncome(
  rewards: MultifloorRewards,
  multifloorItems: ScheduleItemV2[],
  maxFloors: Record<string, number>,
  defaultMaxFloor: number,
  today: string,
  getTitle: (item: ScheduleItemV2) => string,
  server: RewardServer,
  skipKeys?: ReadonlySet<string>,
): IncomeByKey {
  const result: IncomeByKey = {};
  for (const item of multifloorItems) {
    const maxFloor = maxFloors[item.id] ?? defaultMaxFloor;
    if (!maxFloor || !isUpcoming(item, today)) continue;
    for (const [key, amount] of Object.entries(multifloorSeasonTotals(rewards, item, server, maxFloor))) {
      if (skipKeys?.has(key)) continue;
      addIncome(result, key, { id: item.id, kind: 'multifloor', name: getTitle(item), date: (item.endTime ?? item.startTime).slice(0, 10), amount, prediction: !!item.details?.prediction });
    }
  }
  return sortIncomes(result);
}

const COIN_SHOP_MONTHS_AHEAD = 12;

/**
 * Monthly maximum purchases of the items the user marked for auto-buy: the items come in and the coins go out.
 * Starts from next month's refresh, because this month's purchases may already be part of the owned amount.
 */
export function buildCoinShopIncome(monthly: CoinShopMonthly, autoBuy: Record<string, boolean>, today: string): IncomeByKey {
  const result: IncomeByKey = {};
  const [year, month, day] = today.split('-').map(Number);
  // The shop refreshes on the 1st, so on that day the fresh lineup is most likely still unbought; otherwise start next month.
  const firstOffset = day === 1 ? 0 : 1;
  for (const [coinKey, items] of Object.entries(monthly)) {
    const bought = Object.entries(items).filter(([key]) => autoBuy[key]);
    const monthlyCost = bought.reduce((sum, [, { cost }]) => sum + cost, 0);
    for (let offset = firstOffset; offset < firstOffset + COIN_SHOP_MONTHS_AHEAD; offset++) {
      const index = month - 1 + offset;
      const monthStart = `${year + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
      const entry = { id: `${coinKey}-${monthStart}`, kind: 'coinShop' as const, name: coinKey, date: monthStart, prediction: false };
      for (const [key, { amount }] of bought) addIncome(result, key, { ...entry, amount });
      if (monthlyCost > 0) (result[coinKey] ??= []).push({ ...entry, amount: -monthlyCost });
    }
  }
  return sortIncomes(result);
}

export interface ExpectedIncomeInput {
  eventPlans: Record<string, PlanCache>;
  events: ScheduleItemV2[];
  raidItems: ScheduleItemV2[];
  multifloorItems: ScheduleItemV2[];
  multifloor: { rewards: MultifloorRewards | null; maxFloors: Record<string, number>; defaultMaxFloor: number };
  eventTotals: EventFixedTotals | null;
  eventIncomeMode: EventIncomeMode | undefined;
  coinShop: { monthly: CoinShopMonthly | null; autoBuy: Record<string, boolean> };
  raidRewards: RaidSeasonRewards | null;
  server: RewardServer;
  assumptions: IncomeAssumptions | undefined;
  today: string;
  getTitle: (item: ScheduleItemV2) => string;
  /** Items another income model already covers, so assumed rewards do not count them twice. */
  skipKeys?: ReadonlySet<string>;
}

/** Event income by the chosen mode plus every source the user chose to assume in full. */
export function buildExpectedIncome({
  eventPlans,
  events,
  raidItems,
  multifloorItems,
  multifloor,
  eventTotals,
  eventIncomeMode,
  coinShop,
  raidRewards,
  server,
  assumptions,
  today,
  getTitle,
  skipKeys,
}: ExpectedIncomeInput): IncomeByKey {
  const raidKinds = new Set(ASSUMABLE_INCOME_SOURCES.flatMap(({ id }) => ((id === 'raid' || id === 'eraid') && isIncomeAssumed(assumptions, id) ? [id] : [])));
  return mergeIncome(
    (eventIncomeMode ?? DEFAULT_EVENT_INCOME_MODE) === 'all' ? (eventTotals ? buildEventFixedIncome(eventTotals, events, today, getTitle) : {}) : buildEventIncome(eventPlans, events, today, getTitle),
    raidRewards && raidKinds.size > 0 ? buildRaidIncome(raidRewards, raidItems, today, getTitle, { server, kinds: raidKinds, skipKeys }) : {},
    coinShop.monthly ? buildCoinShopIncome(coinShop.monthly, coinShop.autoBuy, today) : {},
    multifloor.rewards ? buildMultifloorIncome(multifloor.rewards, multifloorItems, multifloor.maxFloors, multifloor.defaultMaxFloor, today, getTitle, server, skipKeys) : {},
  );
}

function sumMilestones(milestones: SeasonMilestones): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [, items] of milestones) {
    for (const [key, amount] of Object.entries(items)) totals[key] = (totals[key] ?? 0) + amount;
  }
  return totals;
}

export function mergeIncome(...groups: IncomeByKey[]): IncomeByKey {
  const result: IncomeByKey = {};
  for (const group of groups) {
    for (const [key, list] of Object.entries(group)) (result[key] ??= []).push(...list);
  }
  return sortIncomes(result);
}

/** Whether the expected income closes a shortage of `deficit` (a positive amount still missing). */
export function isCoveredByIncome(deficit: number, incomes: ItemIncome[] = []): boolean {
  return deficit > 0 && incomes.reduce((sum, income) => sum + income.amount, 0) >= deficit;
}

/** Upcoming or running events whose stages drop the item, nearest first. Each event appears once with its best drop. */
export function findEventDropSources(itemKey: string, dropIndex: EventDropIndex, events: ScheduleItemV2[], today: string, getTitle: (item: ScheduleItemV2) => string, limit = 3): EventDropSource[] {
  const entries = dropIndex[itemKey];
  if (!entries) return [];
  const bestByEvent = new Map<number, EventDropEntry>();
  for (const entry of entries) {
    const best = bestByEvent.get(entry.e);
    if (!best || entry.p > best.p) bestByEvent.set(entry.e, entry);
  }
  const sources: EventDropSource[] = [];
  for (const item of events) {
    const eventId = scheduleEventId(item);
    const stage = eventId === null ? undefined : bestByEvent.get(eventId);
    if (!stage || !isUpcoming(item, today)) continue;
    sources.push({ eventId: eventId as number, name: getTitle(item), date: item.startTime.slice(0, 10), prediction: !!item.details?.prediction, stage });
  }
  return sources.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}
