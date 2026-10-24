// Fixed dice routing: single vs. double use, early stop after the first die, jump tiles, lap rewards, and the
// optimizer helpers. Rolls are forced to 1 (Math.random -> 0) so every non-fixed roll advances exactly one tile.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { recommendFixedDiceRouting, getRecommendInputKey, getSimInputKey, getDiceRaceGoalIssue } from '~/features/event-planner/minigames/DiceRacePlanner';
import { runSimulation } from '~/features/event-planner/logic/diceRaceSim';
import { DefaultDiceRaceSimConfig, type DiceRaceSimConfig } from '~/types/minigame/diceRace';
import type { EventData } from '~/types/plannerData';

const BOARD_SIZE = 8;
const COST_PER_ROLL = 100;
const TICKET_ITEM_ID = 999;

type DiceRace = NonNullable<EventData['dice_race']>;

function buildDiceRace(options?: { jumps?: Record<number, number>; lapRewards?: { lap: number; itemId: number; amount: number }[] }): DiceRace {
  const jumps = options?.jumps ?? {};
  return {
    info: [{ DiceCostGoods: { ConsumeParcelId: [TICKET_ITEM_ID], ConsumeParcelAmount: [COST_PER_ROLL], ConsumeParcelTypeStr: ['Item'], ParcelId: [], ParcelAmount: [], ParcelTypeStr: [] } }],
    porb: [],
    total_reward: (options?.lapRewards ?? []).map((r) => ({
      RequiredLapFinishCount: r.lap,
      RewardParcelTypeStr: ['Item' as const],
      RewardParcelId: [r.itemId],
      RewardParcelAmount: [r.amount],
    })),
    race_node: Array.from({ length: BOARD_SIZE }, (_, i) =>
      i in jumps ? { NodeId: i, EventContentDiceRaceNodeType: 2, MoveForwardTypeArg: jumps[i] } : { NodeId: i, EventContentDiceRaceNodeType: 1, MoveForwardTypeArg: 0 },
    ),
  };
}

const baseEventData = {
  season: { Name: '', EventContentOpenTime: '', EventContentCloseTime: '', ExtensionTime: '', EventContentTypeStr: [] },
  icons: { Item: {}, Equipment: {}, Currency: {} },
  currency: [],
} as unknown as EventData;

const run = (diceRace: DiceRace, config: Partial<DiceRaceSimConfig>, options?: { checkpoints?: number[] }) => {
  const full: DiceRaceSimConfig = { ...DefaultDiceRaceSimConfig, simRuns: 3, startLap: 1, targetLap: 1, endConditionType: 'lap_pos', ...config };
  return runSimulation(diceRace, full, { ...baseEventData, dice_race: diceRace, currency: [] }, options);
};

const dice = (owned: Record<number, number>) => ({ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, ...Object.fromEntries(Object.entries(owned)) });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('double fixed dice', () => {
  it('uses two dice when only their sum reaches a priority tile (on) and ignores it when off or unset', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const board = buildDiceRace();
    const config = { ownedFixedDice: dice({ 3: 1, 4: 1 }), fixedDicePriority: [7], targetPos: 7 };

    const on = run(board, { ...config, allowDoubleFixedDice: true });
    expect(on.avgFixedDiceUsed).toBe(2);
    expect(on.avgRolls).toBe(0);

    const off = run(board, { ...config, allowDoubleFixedDice: false });
    const unset = run(board, { ...config, allowDoubleFixedDice: undefined });
    // Without pairs, only a single die once the token has walked to tile 3 (die 4) or 4 (die 3) helps.
    expect(off.avgFixedDiceUsed).toBe(1);
    expect(off.avgRolls).toBe(3);
    expect(unset).toEqual(off);
  });

  it('prefers a single die over a pair when one die already reaches a priority tile', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = run(buildDiceRace(), { ownedFixedDice: dice({ 3: 1, 4: 1 }), fixedDicePriority: [4, 7], targetPos: 4, allowDoubleFixedDice: true });
    expect(result.avgFixedDiceUsed).toBe(1);
    expect(result.avgRolls).toBe(0);
  });

  it('does not spend the second die when the goal is already met after the first', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // Pair (4, 3) is chosen for tile 7, but the goal (position 4) is reached by the first die alone.
    const result = run(buildDiceRace(), { ownedFixedDice: dice({ 3: 1, 4: 1 }), fixedDicePriority: [7], targetPos: 4, allowDoubleFixedDice: true });
    expect(result.avgFixedDiceUsed).toBe(1);
  });

  it('needs two owned dice for a pair of the same face', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const config = { fixedDicePriority: [4], targetPos: 4, allowDoubleFixedDice: true };
    const one = run(buildDiceRace(), { ...config, ownedFixedDice: dice({ 2: 1 }) });
    // A lone die of 2 only helps as a single die after walking to tile 2.
    expect(one.avgFixedDiceUsed).toBe(1);
    expect(one.avgRolls).toBe(2);
    const two = run(buildDiceRace(), { ...config, ownedFixedDice: dice({ 2: 2 }) });
    expect(two.avgFixedDiceUsed).toBe(2);
    expect(two.avgRolls).toBe(0);
  });

  it('follows forward-move tiles when predicting where the first die lands', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // Tile 5 pushes the token to 7. Dice (5, 2) end on 1; (2, 5) end on 7, so only the latter order is a hit.
    const result = run(buildDiceRace({ jumps: { 5: 2 } }), { ownedFixedDice: dice({ 2: 1, 5: 1 }), fixedDicePriority: [7], targetPos: 7, allowDoubleFixedDice: true });
    expect(result.avgFixedDiceUsed).toBe(2);
    expect(result.avgRolls).toBe(0);
  });

  it('applies lap rewards and checkpoints when the first die of a pair crosses the lap line', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const board = buildDiceRace({ lapRewards: [{ lap: 2, itemId: 1, amount: 10 }] });
    const result = run(board, { startPos: 6, ownedFixedDice: dice({ 1: 1, 3: 1 }), fixedDicePriority: [2], targetLap: 2, targetPos: 2, allowDoubleFixedDice: true }, { checkpoints: [2] });
    expect(result.avgFixedDiceUsed).toBe(2);
    expect(result.avgRewards['Item_1']).toBe(10);
    expect(result.checkpoints[2].avgRewards['Item_1']).toBe(10);
  });
});

const fullEventData = (board: DiceRace) => ({ ...baseEventData, dice_race: board, currency: [] }) as Parameters<typeof recommendFixedDiceRouting>[2];

describe('seeded simulation', () => {
  it('repeats exactly for the same seed and differs for another seed', () => {
    const board = buildDiceRace();
    const config = { ...DefaultDiceRaceSimConfig, simRuns: 200, targetLap: 3, targetPos: 5, ownedFixedDice: dice({}) };
    const eventData = fullEventData(board);
    const a = runSimulation(board, config, eventData, { seed: 7, perRunRewardKey: 'Item_1' });
    const b = runSimulation(board, config, eventData, { seed: 7, perRunRewardKey: 'Item_1' });
    const c = runSimulation(board, config, eventData, { seed: 8, perRunRewardKey: 'Item_1' });
    expect(Array.from(a.perRun?.rolls ?? [])).toEqual(Array.from(b.perRun?.rolls ?? []));
    expect(c.avgRolls).not.toBe(a.avgRolls);
  });
});

describe('recommendFixedDiceRouting', () => {
  const board = buildDiceRace();
  const config: DiceRaceSimConfig = { ...DefaultDiceRaceSimConfig, targetLap: 1, targetPos: 7, ownedFixedDice: dice({ 3: 1, 4: 1 }) };

  it('recommends tiles that beat the current strategy, and then has nothing left to improve', () => {
    const first = recommendFixedDiceRouting(board, config, fullEventData(board), { type: 'rolls' });
    expect(first.status).toBe('improved');
    expect(first.strategy.fixedDicePriority.length).toBeGreaterThan(0);
    expect(first.recommended.avgRolls).toBeLessThan(first.current.avgRolls);

    const applied = { ...config, ...first.strategy };
    const second = recommendFixedDiceRouting(board, applied, fullEventData(board), { type: 'rolls' });
    expect(second.status).toBe('noGain');
    expect(second.strategy.fixedDicePriority).toEqual(applied.fixedDicePriority);
  });

  it('reports no gain when no fixed dice are owned or earnable', () => {
    const result = recommendFixedDiceRouting(board, { ...config, ownedFixedDice: dice({}) }, fullEventData(board), { type: 'rolls' });
    expect(result.status).toBe('noGain');
    expect(result.gain).toBe(0);
  });

  it('supports reward-per-ticket as the criterion', () => {
    const rewardBoard = buildDiceRace({ lapRewards: [{ lap: 2, itemId: 1, amount: 10 }] });
    const result = recommendFixedDiceRouting(rewardBoard, { ...config, targetLap: 3, targetPos: 0 }, fullEventData(rewardBoard), { type: 'perTicket', rewardKey: 'Item_1' });
    expect(result.recommended.perTicket).not.toBeNull();
    expect(result.recommended.perTicket ?? 0).toBeGreaterThanOrEqual(result.current.perTicket ?? 0);
  });
});

describe('input keys and goal guards', () => {
  it('ties a recommendation to the current strategy and the criterion, but not to simRuns', () => {
    const base = getRecommendInputKey({ type: 'rolls' }, DefaultDiceRaceSimConfig);
    expect(getRecommendInputKey({ type: 'rolls' }, { ...DefaultDiceRaceSimConfig, simRuns: 10 })).toBe(base);
    expect(getRecommendInputKey({ type: 'rolls' }, { ...DefaultDiceRaceSimConfig, fixedDicePriority: [1] })).not.toBe(base);
    expect(getRecommendInputKey({ type: 'rolls' }, { ...DefaultDiceRaceSimConfig, allowDoubleFixedDice: true })).not.toBe(base);
    expect(getRecommendInputKey({ type: 'perTicket', rewardKey: 'Item_1' }, DefaultDiceRaceSimConfig)).not.toBe(base);
    expect(getSimInputKey({ ...DefaultDiceRaceSimConfig, targetLap: 3 })).not.toBe(getSimInputKey(DefaultDiceRaceSimConfig));
  });

  it('flags item goals that cannot finish', () => {
    const board = buildDiceRace({ lapRewards: [{ lap: 2, itemId: 5, amount: 10 }] });
    const item = { ...DefaultDiceRaceSimConfig, endConditionType: 'item' as const };
    expect(getDiceRaceGoalIssue(board, { ...item, targetItemId: 0, targetItemAmount: 5 })).toBe('noTargetItem');
    expect(getDiceRaceGoalIssue(board, { ...item, targetItemId: 5, targetItemAmount: 11 })).toBe('targetUnreachable');
    expect(getDiceRaceGoalIssue(board, { ...item, targetItemId: 5, targetItemAmount: 10 })).toBeNull();
    expect(getDiceRaceGoalIssue(board, { ...DefaultDiceRaceSimConfig, targetItemId: 0, targetItemAmount: 5 })).toBeNull();
  });
});
