// Dice race (extractDiceRace) correctness: horizon/routing independence, per-resource cumulative cost
// bundling across silent laps (a lap's reward can't be reached without paying for every lap before it), and lap-order enforcement
// in the cumulative curve despite ratio-based display sorting.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveResourceApProfile, buildCumulativeCurve, type StageWithType } from '~/features/event-planner/logic/resourceApCost';
import type { EventData } from '~/types/plannerData';

const BOARD_SIZE = 6;
const COST_PER_ROLL = 100;
const TICKET_ITEM_ID = 999;

function buildDiceRace(totalReward: { RequiredLapFinishCount: number; itemId: number; amount: number }[]): NonNullable<EventData['dice_race']> {
  return {
    info: [{ DiceCostGoods: { ConsumeParcelId: [TICKET_ITEM_ID], ConsumeParcelAmount: [COST_PER_ROLL], ConsumeParcelTypeStr: ['Item'], ParcelId: [], ParcelAmount: [], ParcelTypeStr: [] } }],
    porb: [],
    total_reward: totalReward.map((r) => ({ RequiredLapFinishCount: r.RequiredLapFinishCount, RewardParcelTypeStr: ['Item'], RewardParcelId: [r.itemId], RewardParcelAmount: [r.amount] })),
    race_node: Array.from({ length: BOARD_SIZE }, (_, i) => ({ NodeId: i, EventContentDiceRaceNodeType: 1, MoveForwardTypeArg: 0 })),
  };
}

// One repeatable stage dropping the dice ticket, so its AP rate (1 AP/ticket) is resolvable — without a
// producer, the ticket currency's rate stays unresolved and dice_race segments get dropped entirely.
// Yield is kept tiny (1 ticket) relative to the dice race's own costs in these tests: resourceApCost.ts
// treats a stage's cheapest route to a currency as a reusable "mandatory prefix" pool (sequencedFamilyPrefix)
// that nets into other same-currency costs — real event tickets dwarf a single stage clear's yield, but a
// same-sized toy pool would fully (and unrealistically) absorb a toy-sized lap cost, which isn't what these
// tests are about; the tiny yield keeps that unrelated mechanism from interfering here.
const ticketStage: StageWithType = {
  Id: 1,
  Name: 'EVENT_999_Normal_MainGround_Stage01',
  StageEnterCostAmount: 1,
  EventContentStageReward: [{ RewardId: TICKET_ITEM_ID, RewardAmount: 1, RewardTagStr: 'Event', RewardParcelTypeStr: 'Item', RewardProb: 10000 }],
  RecommandLevel: 1,
  BattleDuration: 1,
  type: 'stage',
};
const TICKET_AP_RATE = 1;

function baseEventData(diceRace: NonNullable<EventData['dice_race']>): EventData {
  return {
    season: { Name: '', EventContentOpenTime: '', EventContentCloseTime: '', ExtensionTime: '', EventContentTypeStr: [] },
    icons: { Item: {}, Equipment: {}, Currency: {} },
    currency: [],
    stage: { stage: [ticketStage] },
    dice_race: diceRace,
  };
}

function mockRollSix() {
  // Math.floor(0.99 * 6) + 1 === 6 — every roll wraps the 6-tile board exactly once (1 roll == 1 lap).
  return vi.spyOn(Math, 'random').mockReturnValue(0.99);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractDiceRace', () => {
  it('bundles the cost of silent intervening laps into a resource that only reappears later, instead of charging just the last-lap increment', () => {
    mockRollSix();
    // Item_A at lap 2 and again at lap 5 (laps 3-4 are silent for Item_A, held by Item_B instead).
    const diceRace = buildDiceRace([
      { RequiredLapFinishCount: 2, itemId: 1, amount: 10 },
      { RequiredLapFinishCount: 3, itemId: 2, amount: 5 },
      { RequiredLapFinishCount: 5, itemId: 1, amount: 10 },
    ]);
    const eventData = baseEventData(diceRace);
    const profile = resolveResourceApProfile('Item_1', { allStages: [ticketStage], eventData, eventId: 1, includeSimulations: true });

    const lapSegments = profile.segments.filter((s) => s.source.type === 'dice_race_lap');
    expect(lapSegments).toHaveLength(2);
    const lap2 = lapSegments.find((s) => s.source.type === 'dice_race_lap' && s.source.lap === 2);
    const lap5 = lapSegments.find((s) => s.source.type === 'dice_race_lap' && s.source.lap === 5);
    expect(lap2).toBeDefined();
    expect(lap5).toBeDefined();
    if (!lap2 || !lap5) throw new Error('unreachable');

    // lap2: 1 roll (100 tickets) since start -> 1 AP.
    expect(lap2.amount).toBeCloseTo(10, 5);
    expect(lap2.apCost).toBeCloseTo(1 * COST_PER_ROLL * TICKET_AP_RATE, 5);

    // lap5's Item_1 cost must span back to lap2 (its own last occurrence), bundling in the silent lap
    // 3->4 ticket cost too, NOT just the lap4->5 increment -- this is the fix under test.
    // Cumulative rolls to lap5 = 4 (lap2,3,4,5), to lap2 = 1 -> delta = 3 rolls = 300 tickets.
    expect(lap5.amount).toBeCloseTo(10, 5);
    expect(lap5.apCost).toBeCloseTo(3 * COST_PER_ROLL * TICKET_AP_RATE, 5);
  });

  it('enforces lap order in the cumulative curve even when a later lap has a better amount/cost ratio', () => {
    mockRollSix();
    // Item_A: lap2 gives a little at a so-so rate, lap5 gives a lot at a BETTER rate -- if the curve sorted
    // purely by ratio it would try to take lap5 before lap2, which is impossible (can't skip laps 3-4).
    const diceRace = buildDiceRace([
      { RequiredLapFinishCount: 2, itemId: 1, amount: 5 },
      { RequiredLapFinishCount: 5, itemId: 1, amount: 50 },
    ]);
    const eventData = baseEventData(diceRace);
    const profile = resolveResourceApProfile('Item_1', { allStages: [ticketStage], eventData, eventId: 1, includeSimulations: true });
    const lapSegments = profile.segments.filter((s) => s.source.type === 'dice_race_lap');
    expect(lapSegments).toHaveLength(2);
    const lap2 = lapSegments.find((s) => s.source.type === 'dice_race_lap' && s.source.lap === 2);
    const lap5 = lapSegments.find((s) => s.source.type === 'dice_race_lap' && s.source.lap === 5);
    if (!lap2 || !lap5) throw new Error('unreachable');
    // lap5's ratio (50 / 3 rolls) is better than lap2's (5 / 1 roll) -- confirms the inversion is real.
    expect(lap5.amount / lap5.apCost).toBeGreaterThan(lap2.amount / lap2.apCost);

    // Budget covering exactly lap5's own apCost, but not both lap2 + lap5 together.
    const maxAp = lap5.apCost;
    const curve = buildCumulativeCurve(profile.segments, maxAp);
    const final = curve[curve.length - 1];
    // Correct (sequence-respecting): lap2 is taken first (fits easily), then lap5 (clamped at the budget
    // edge but still counted, same all-or-nothing approximation used for every other source) -> 55 total.
    // Wrong (pure ratio sort): lap5 taken alone first, then budget is exhausted before lap2 -> only 50.
    expect(final.amount).toBeCloseTo(55, 5);
  });

  it('is unreachable: lap 1 itself never grants its total_reward entry (currentLap starts there, never incremented into it)', () => {
    mockRollSix();
    const diceRace = buildDiceRace([{ RequiredLapFinishCount: 1, itemId: 1, amount: 999 }]);
    const eventData = baseEventData(diceRace);
    const profile = resolveResourceApProfile('Item_1', { allStages: [ticketStage], eventData, eventId: 1, includeSimulations: true });
    expect(profile.segments.filter((s) => s.source.type === 'dice_race_lap' || s.source.type === 'dice_race')).toHaveLength(0);
  });

  it('separates the finite per-lap milestones from an open-ended repeatsForever tail sourced from race_node alone', () => {
    // Roll a fixed 1 (not 6) here: a constant roll of 6 always wraps the 6-tile board back to the same
    // position, so position 2 would never actually be visited to collect its reward.
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // floor(0.01 * 6) + 1 === 1
    const diceRace = buildDiceRace([{ RequiredLapFinishCount: 2, itemId: 1, amount: 10 }]);
    // race_node tile at position 2 drops Item_2 every lap, including every lap of the open-ended tail.
    diceRace.race_node[2] = { ...diceRace.race_node[2], RewardParcelTypeStr: ['Item'], RewardParcelId: [2], RewardAmount: [1] };
    const eventData = baseEventData(diceRace);

    const profileA = resolveResourceApProfile('Item_1', { allStages: [ticketStage], eventData, eventId: 1, includeSimulations: true });
    expect(profileA.segments.every((s) => !s.repeatsForever)).toBe(true); // milestone reward is finite, not a repeating rate

    const profileB = resolveResourceApProfile('Item_2', { allStages: [ticketStage], eventData, eventId: 1, includeSimulations: true });
    const tail = profileB.segments.find((s) => s.source.type === 'dice_race');
    expect(tail).toBeDefined();
    expect(tail?.repeatsForever).toBe(true);
  });

  it('ignores the user plan targetLap/endConditionType entirely -- horizon is fixed by total_reward data', () => {
    mockRollSix();
    const diceRace = buildDiceRace([{ RequiredLapFinishCount: 2, itemId: 1, amount: 10 }]);
    const eventData = baseEventData(diceRace);
    // diceRaceRouting carries only routing fields per the Ctx type -- targetLap-like fields have no slot to pass,
    // confirming the horizon can't be influenced by a user plan even by construction.
    const profile = resolveResourceApProfile('Item_1', {
      allStages: [ticketStage],
      eventData,
      eventId: 1,
      includeSimulations: true,
      diceRaceRouting: { fixedDicePriority: [], ownedFixedDice: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 } },
    });
    const lap2 = profile.segments.find((s) => s.source.type === 'dice_race_lap' && s.source.lap === 2);
    expect(lap2).toBeDefined();
    expect(lap2?.amount).toBeCloseTo(10, 5);
  });
  it('passes allowDoubleFixedDice routing through so a pair of owned dice lowers the lap cost', () => {
    // Every plain roll is 1. From tile 0, two 3s land on priority tile 0 again (one full lap) without paying for rolls.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const diceRace = buildDiceRace([{ RequiredLapFinishCount: 2, itemId: 1, amount: 10 }]);
    const eventData = baseEventData(diceRace);
    const lapApCost = (allowDoubleFixedDice: boolean) => {
      const profile = resolveResourceApProfile('Item_1', {
        allStages: [ticketStage],
        eventData,
        eventId: 1,
        includeSimulations: true,
        diceRaceRouting: { fixedDicePriority: [0], ownedFixedDice: { '1': 0, '2': 0, '3': 2, '4': 0, '5': 0, '6': 0 }, allowDoubleFixedDice },
      });
      return profile.segments.find((s) => s.source.type === 'dice_race_lap' && s.source.lap === 2)?.apCost;
    };
    const off = lapApCost(false);
    const on = lapApCost(true);
    expect(off).toBeGreaterThan(0);
    // A lap that costs nothing may be dropped from the segments entirely, so treat "missing" as zero cost.
    expect(on ?? 0).toBeLessThan(off ?? 0);
  });
});
