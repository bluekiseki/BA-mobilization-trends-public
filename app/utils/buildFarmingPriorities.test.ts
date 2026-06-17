import { describe, it, expect } from 'vitest';
import { buildFarmingPriorities } from './buildFarmingPriorities';
import type { Stage, StageReward } from '~/types/plannerData';
import type { StagePrio } from '~/components/planner/FarmingPlannerTypes';

const makeStage = (id: number, rewardIds: number[]): Stage => ({
  Id: id,
  Name: `Stage ${id}`,
  StageEnterCostAmount: 10,
  EventContentStageReward: rewardIds.map(
    (rid) =>
      ({
        RewardId: rid,
        RewardAmount: 1,
        RewardTagStr: 'Rare',
        RewardParcelTypeStr: 'Item',
        RewardProb: 100,
      }) satisfies StageReward,
  ),
  RecommandLevel: 1,
  BattleDuration: 60,
});

describe('buildFarmingPriorities', () => {
  const stages = [
    makeStage(1, [100, 200]), // Ooparts A (100) drop
    makeStage(2, [200]), // No Ooparts A
    makeStage(3, [100, 300]), // Ooparts A (100) drop
  ];

  it('returns based on stagePrio if priorityItemId is null', () => {
    const stagePrio: Record<number, StagePrio> = { 2: 'priority' };
    const result = buildFarmingPriorities(stages, null, stagePrio);
    expect(result).toEqual([false, true, false]);
  });

  it('prioritizes stages dropping the selected item when priorityItemId is selected', () => {
    const result = buildFarmingPriorities(stages, 100, null);
    expect(result).toEqual([true, false, true]);
  });

  it('ignores stagePrio when priorityItemId is selected', () => {
    const stagePrio: Record<number, StagePrio> = { 2: 'priority' };
    const result = buildFarmingPriorities(stages, 100, stagePrio);
    expect(result).toEqual([true, false, true]); // Stage 2 is not a priority
  });

  it('returns all false when a non-existent item ID is selected', () => {
    const result = buildFarmingPriorities(stages, 999, null);
    expect(result).toEqual([false, false, false]);
  });

  it('empty stages array', () => {
    const result = buildFarmingPriorities([], 100, null);
    expect(result).toEqual([]);
  });

  it('returns all false when both stagePrio and priorityItemId are null', () => {
    const result = buildFarmingPriorities(stages, null, null);
    expect(result).toEqual([false, false, false]);
  });
});
