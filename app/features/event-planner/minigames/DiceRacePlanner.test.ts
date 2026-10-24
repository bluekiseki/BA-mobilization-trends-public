// Checkpoint snapshots must reflect the cumulative cost/rewards at the exact instant currentLap first
// reaches each requested value, since resourceApCost.ts's extractDiceRace diffs them to build segments.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runSimulation } from '~/features/event-planner/logic/diceRaceSim';
import { DefaultDiceRaceSimConfig } from '~/types/minigame/diceRace';
import type { EventData } from '~/types/plannerData';

// 6-tile board, every roll forced to 6 (see mockRollSix below) so each roll completes exactly one lap and
// lands back on position 0 — makes cost/lap trivially predictable (1 roll == 1 lap == costPerRoll ticket cost).
const BOARD_SIZE = 6;
const COST_PER_ROLL = 100;
const TICKET_ITEM_ID = 999;

function buildDiceRace(totalReward: { RequiredLapFinishCount: number; RewardParcelId: number[]; RewardAmount: number[] }[]): NonNullable<EventData['dice_race']> {
  return {
    info: [
      {
        DiceCostGoods: {
          ConsumeParcelId: [TICKET_ITEM_ID],
          ConsumeParcelAmount: [COST_PER_ROLL],
          ConsumeParcelTypeStr: ['Item'],
          ParcelId: [],
          ParcelAmount: [],
          ParcelTypeStr: [],
        },
      },
    ],
    porb: [],
    total_reward: totalReward.map((r) => ({
      RequiredLapFinishCount: r.RequiredLapFinishCount,
      RewardParcelTypeStr: r.RewardParcelId.map(() => 'Item' as const),
      RewardParcelId: r.RewardParcelId,
      RewardParcelAmount: r.RewardAmount,
    })),
    race_node: Array.from({ length: BOARD_SIZE }, (_, i) => ({ NodeId: i, EventContentDiceRaceNodeType: 1, MoveForwardTypeArg: 0 })),
  };
}

const eventData = {
  season: { Name: '', EventContentOpenTime: '', EventContentCloseTime: '', ExtensionTime: '', EventContentTypeStr: [] },
  icons: { Item: {}, Equipment: {}, Currency: {} },
  currency: [],
} as unknown as EventData;

function mockRollSix() {
  // Math.floor(0.99 * 6) + 1 === 6 — every roll wraps the 6-tile board exactly once.
  return vi.spyOn(Math, 'random').mockReturnValue(0.99);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runSimulation checkpoints option', () => {
  it('matches the no-checkpoints return shape when omitted (backward compatible)', () => {
    mockRollSix();
    const diceRace = buildDiceRace([{ RequiredLapFinishCount: 2, RewardParcelId: [1], RewardAmount: [10] }]);
    const config = { ...DefaultDiceRaceSimConfig, simRuns: 5, startLap: 1, targetLap: 3, fixedDicePriority: [] };
    const withoutOption = runSimulation(diceRace, config, { ...eventData, dice_race: diceRace, currency: [] });
    const withEmptyOption = runSimulation(diceRace, config, { ...eventData, dice_race: diceRace, currency: [] }, {});
    expect(withoutOption.avgCost).toEqual(withEmptyOption.avgCost);
    expect(withoutOption.avgRewards).toEqual(withEmptyOption.avgRewards);
    expect(withoutOption.checkpoints).toEqual({});
    expect(withEmptyOption.checkpoints).toEqual({});
  });

  it('records the cumulative cost/rewards snapshot at the instant each checkpoint lap is first reached', () => {
    mockRollSix();
    const diceRace = buildDiceRace([
      { RequiredLapFinishCount: 2, RewardParcelId: [1], RewardAmount: [10] },
      { RequiredLapFinishCount: 3, RewardParcelId: [2], RewardAmount: [5] },
      { RequiredLapFinishCount: 5, RewardParcelId: [1], RewardAmount: [10] }, // Item_1 reappears after a silent lap 4
    ]);
    const config = { ...DefaultDiceRaceSimConfig, simRuns: 10, startLap: 1, targetLap: 5, fixedDicePriority: [] };
    const result = runSimulation(diceRace, config, { ...eventData, dice_race: diceRace, currency: [] }, { checkpoints: [2, 3, 4, 5] });

    // Lap 1 is the start value, never reached via increment, so it's unreachable — matches real event data
    // behavior (see resourceApCost.ts extractDiceRace comment) and must not appear as a checkpoint.
    // Lap 4 has no total_reward entry here but was still requested as a checkpoint — must still be recorded
    // (checkpoints are purely lap-based, independent of whether that lap grants anything).
    expect(Object.keys(result.checkpoints).map(Number).sort()).toEqual([2, 3, 4, 5]);

    expect(result.checkpoints[2].avgCost[`Item_${TICKET_ITEM_ID}`]).toBeCloseTo(1 * COST_PER_ROLL, 5);
    expect(result.checkpoints[2].avgRewards['Item_1']).toBeCloseTo(10, 5);

    expect(result.checkpoints[3].avgCost[`Item_${TICKET_ITEM_ID}`]).toBeCloseTo(2 * COST_PER_ROLL, 5);
    expect(result.checkpoints[3].avgRewards['Item_1']).toBeCloseTo(10, 5);
    expect(result.checkpoints[3].avgRewards['Item_2']).toBeCloseTo(5, 5);

    expect(result.checkpoints[4].avgCost[`Item_${TICKET_ITEM_ID}`]).toBeCloseTo(3 * COST_PER_ROLL, 5);
    // No new reward at lap 4 — cumulative rewards unchanged from lap 3.
    expect(result.checkpoints[4].avgRewards['Item_1']).toBeCloseTo(10, 5);
    expect(result.checkpoints[4].avgRewards['Item_2']).toBeCloseTo(5, 5);

    expect(result.checkpoints[5].avgCost[`Item_${TICKET_ITEM_ID}`]).toBeCloseTo(4 * COST_PER_ROLL, 5);
    expect(result.checkpoints[5].avgRewards['Item_1']).toBeCloseTo(20, 5); // cumulative: 10 (lap2) + 10 (lap5)
    expect(result.checkpoints[5].avgRewards['Item_2']).toBeCloseTo(5, 5);

    // The final (non-checkpoint) return must match the last checkpoint when targetLap == that checkpoint's lap.
    expect(result.avgCost[`Item_${TICKET_ITEM_ID}`]).toBeCloseTo(result.checkpoints[5].avgCost[`Item_${TICKET_ITEM_ID}`], 5);
  });

  it('omits a checkpoint lap never reached within targetLap', () => {
    mockRollSix();
    const diceRace = buildDiceRace([{ RequiredLapFinishCount: 10, RewardParcelId: [1], RewardAmount: [10] }]);
    const config = { ...DefaultDiceRaceSimConfig, simRuns: 5, startLap: 1, targetLap: 3, fixedDicePriority: [] };
    const result = runSimulation(diceRace, config, { ...eventData, dice_race: diceRace, currency: [] }, { checkpoints: [2, 10] });
    expect(Object.keys(result.checkpoints).map(Number).sort()).toEqual([2]);
  });
});
