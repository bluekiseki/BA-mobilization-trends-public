import type { EventData, IconData } from '~/types/plannerData';
import { type DreamMakerStrategy, type DreamMakerSimConfig, type DreamMakerSimResult, defaultDreamMakerConfig } from '~/types/minigame/dreamMaker';

export type { DreamMakerStrategy, DreamMakerSimConfig, DreamMakerSimResult };
export { defaultDreamMakerConfig };

// --- Type Definitions ---
export type DreamMakerTab = 'overview' | 'calculator' | 'missions';
export type AvgPtDisplayMode = 'per_sim' | 'per_action' | 'per_day';

// Simplified result passed up via onCalculate prop (includes mission rewards)
export type DreamMakerResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};

// Props for the DreamMakerPlanner component itself
export interface DreamMakerPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onCalculate: (result: DreamMakerResult | null) => void;
  remainingCurrency: Record<number, number>;
  totalBonus: Record<number, number>;
}
