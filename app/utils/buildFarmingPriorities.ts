import type { Stage } from '~/types/plannerData';
import type { StagePrio } from '~/components/planner/FarmingPlannerTypes';

export function buildFarmingPriorities(stages: Stage[], priorityItemId: number | null, stagePrio: Record<number, StagePrio> | null): boolean[] {
  return stages.map((stage) => (priorityItemId !== null ? stage.EventContentStageReward.some((r) => r.RewardId === priorityItemId) : stagePrio?.[stage.Id] === 'priority'));
}
