import { describe, it, expect } from 'vitest';
import {
  buildEventIncome,
  buildCoinShopIncome,
  buildEventFixedIncome,
  buildExpectedIncome,
  buildMultifloorIncome,
  buildRaidIncome,
  findEventDropSources,
  isCoveredByIncome,
  type EventDropIndex,
  type RaidSeasonRewards,
} from '~/utils/itemOutlook';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';

const title = (item: ScheduleItemV2) => item.id;

const event = (id: string, start: string, end: string, prediction = false): ScheduleItemV2 => ({
  id,
  type: 'event',
  startTime: `${start} 11:00:00`,
  endTime: `${end} 10:59:59`,
  details: { prediction },
});

const plan = (gained: Record<string, number>) => ({
  cachedTotalItems: {
    savedAt: 0,
    availableAp: 0,
    spent: {},
    gained: Object.fromEntries(Object.entries(gained).map(([key, amount]) => [key, { amount, isBonusApplied: false }])),
  },
});

describe('buildEventIncome', () => {
  const events = [event('event-860', '2026-11-10', '2026-11-24', true), event('event-10846', '2026-10-01', '2026-10-15')];

  it('includes saved plans of events that have not ended and flags predictions', () => {
    const result = buildEventIncome({ '860': plan({ Item_130: 60 }), '10846': plan({ Item_130: 99 }) }, events, '2026-11-01', title);
    expect(result.Item_130).toEqual([{ id: 'event-860', kind: 'event', name: 'event-860', date: '2026-11-10', amount: 60, prediction: true }]);
  });

  it('ignores events without a saved plan or with zero amounts', () => {
    expect(buildEventIncome({ '860': plan({ Item_130: 0 }) }, events, '2026-11-01', title)).toEqual({});
    expect(buildEventIncome({}, events, '2026-11-01', title)).toEqual({});
  });
});

describe('buildRaidIncome', () => {
  const rewards: RaidSeasonRewards = {
    raid: {
      '94': [
        [250000, { Item_130: 6 }],
        [500000, { Item_130: 4, Equipment_1: 16 }],
      ],
      '95': [[250000, { Item_200: 30 }]],
    },
    eraid: { '40': [[250000, { Item_130: 1 }]] },
  };
  const raidItem = (season: number, start: string, end: string) => ({
    id: `raid-${season}`,
    type: 'raid',
    season,
    startTime: `${start} 11:00:00`,
    endTime: `${end} 03:59:59`,
    details: { prediction: true },
  });
  const items = [
    raidItem(94, '2027-02-16', '2027-02-23'),
    { id: 'eraid-40', type: 'eraid', season: 40, startTime: '2026-12-01 11:00:00', endTime: '2026-12-08 03:59:59' },
    raidItem(80, '2026-09-01', '2026-09-08'),
    { id: 'jfd-1', type: 'jointFiringDrill', season: 1, startTime: '2026-12-01 11:00:00', endTime: '2026-12-08 03:59:59' },
  ] satisfies ScheduleItemV2[];

  it('sums every milestone for upcoming raid and eraid seasons only', () => {
    const result = buildRaidIncome(rewards, items, '2026-11-01', title, { server: 'jp' });
    expect(result.Item_130.map((i) => [i.id, i.amount, i.date])).toEqual([
      ['eraid-40', 1, '2026-12-08'],
      ['raid-94', 10, '2027-02-23'],
    ]);
    expect(result.Equipment_1).toHaveLength(1);
  });

  it('gives each season its own rewards', () => {
    const result = buildRaidIncome(rewards, [raidItem(94, '2027-02-16', '2027-02-23'), raidItem(95, '2027-03-16', '2027-03-23')], '2026-11-01', title, { server: 'jp' });
    expect(result.Item_200.map((i) => [i.id, i.amount])).toEqual([['raid-95', 30]]);
    expect(result.Item_130.map((i) => i.id)).toEqual(['raid-94']);
  });

  it('maps a KR raid season to the JP season three ahead', () => {
    const result = buildRaidIncome(rewards, [raidItem(91, '2027-02-16', '2027-02-23')], '2026-11-01', title, { server: 'kr' });
    expect(result.Item_130.map((i) => i.id)).toEqual(['raid-91']);
    expect(result.Item_130[0].amount).toBe(10);
  });
});

describe('isCoveredByIncome', () => {
  const incomes = [{ id: 'a', kind: 'event' as const, name: 'a', date: '2026-11-10', amount: 60, prediction: false }];

  it('is not covered when nothing is missing', () => {
    expect(isCoveredByIncome(0, incomes)).toBe(false);
  });
  it('is covered when expected income closes the gap', () => {
    expect(isCoveredByIncome(60, incomes)).toBe(true);
  });
  it('is not covered when income is not enough or absent', () => {
    expect(isCoveredByIncome(61, incomes)).toBe(false);
    expect(isCoveredByIncome(5)).toBe(false);
  });
});

describe('findEventDropSources', () => {
  const index: EventDropIndex = {
    Item_130: [
      { e: 860, g: 'stage', n: '1', p: 2500 },
      { e: 860, g: 'stage', n: '3', p: 5000 },
      { e: 10846, g: 'stage', n: '2', p: 2500 },
      { e: 861, g: 'stage', n: '4', p: 2500 },
    ],
  };
  const events = [event('event-861', '2026-12-08', '2026-12-22', true), event('event-860', '2026-11-10', '2026-11-24', true), event('event-10846', '2026-10-01', '2026-10-15')];

  it('lists upcoming events nearest first with the best drop per event', () => {
    const result = findEventDropSources('Item_130', index, events, '2026-11-01', title);
    expect(result.map((s) => [s.eventId, s.stage.n])).toEqual([
      [860, '3'],
      [861, '4'],
    ]);
  });
  it('respects the limit and unknown items', () => {
    expect(findEventDropSources('Item_130', index, events, '2026-11-01', title, 1)).toHaveLength(1);
    expect(findEventDropSources('Item_1', index, events, '2026-11-01', title)).toEqual([]);
  });
});

describe('buildEventFixedIncome', () => {
  const events = [event('event-860', '2026-11-10', '2026-11-24'), event('event-10846', '2026-10-01', '2026-10-15')];

  it('sums fixed rewards of events that have not ended', () => {
    const totals = { '860': { Item_130: 30 }, '10846': { Item_130: 5 } };
    const result = buildEventFixedIncome(totals, events, '2026-11-01', title);
    expect(result.Item_130).toEqual([{ id: 'event-860', kind: 'eventFixed', name: 'event-860', date: '2026-11-10', amount: 30, prediction: false }]);
  });
});

describe('buildCoinShopIncome', () => {
  const monthly = { Item_60: { Item_200: { amount: 40, cost: 40 }, Item_201: { amount: 30, cost: 135 } } };

  it('buys marked items at the monthly maximum, starting next month', () => {
    const result = buildCoinShopIncome(monthly, { Item_200: true }, '2026-11-15');
    expect(result.Item_200?.slice(0, 3).map((income) => [income.date, income.amount])).toEqual([
      ['2026-12-01', 40],
      ['2027-01-01', 40],
      ['2027-02-01', 40],
    ]);
    expect(result.Item_201).toBeUndefined();
    expect(result.Item_200).toHaveLength(12);
    expect(result.Item_60?.slice(0, 2).map((income) => [income.date, income.amount])).toEqual([
      ['2026-12-01', -40],
      ['2027-01-01', -40],
    ]);
  });
});

describe('buildMultifloorIncome', () => {
  const rewards = { '33': { '1': { Item_11: 20 }, '2': { Item_11: 20, Item_2000: 10 }, '3': { Item_2000: 5 } } };
  const items = [{ ...event('multifloor-33', '2026-11-26', '2026-12-23'), season: 33 }];

  it('sums floors up to the planned floor and skips modeled keys', () => {
    const result = buildMultifloorIncome(rewards, items, { 'multifloor-33': 2 }, 0, '2026-11-01', title, 'jp', new Set(['Item_11']));
    expect(result.Item_2000?.[0].amount).toBe(10);
    expect(result.Item_11).toBeUndefined();
  });

  it('adds nothing without a planned floor or a season entry', () => {
    expect(buildMultifloorIncome(rewards, items, {}, 0, '2026-11-01', title, 'jp')).toEqual({});
    expect(buildMultifloorIncome({}, items, {}, 5, '2026-11-01', title, 'jp')).toEqual({});
  });
});

describe('buildExpectedIncome', () => {
  const base = {
    eventPlans: { '860': plan({ Item_130: 7 }) },
    events: [event('event-860', '2026-11-10', '2026-11-24')],
    raidItems: [{ ...event('raid-94', '2026-11-20', '2026-11-27'), season: 94 }],
    multifloorItems: [],
    multifloor: { rewards: null, maxFloors: {}, defaultMaxFloor: 0 },
    eventTotals: { '860': { Item_130: 30 } },
    coinShop: { monthly: null, autoBuy: {} },
    raidRewards: { raid: { '94': [[1, { Item_130: 6 }]] as Array<[number, Record<string, number>]> }, eraid: {} },
    server: 'jp' as const,
    today: '2026-11-01',
    getTitle: title,
  };

  it('uses event planner results by default and keeps raid on by default', () => {
    const result = buildExpectedIncome({ ...base, assumptions: undefined, eventIncomeMode: undefined });
    expect(result.Item_130?.map((income) => [income.kind, income.amount])).toEqual([
      ['event', 7],
      ['raid', 6],
    ]);
  });

  it('in "all" mode ignores saved plans and sums shop and mission totals instead', () => {
    const result = buildExpectedIncome({ ...base, assumptions: { raid: false }, eventIncomeMode: 'all' });
    expect(result.Item_130?.map((income) => [income.kind, income.amount])).toEqual([['eventFixed', 30]]);
  });
});
