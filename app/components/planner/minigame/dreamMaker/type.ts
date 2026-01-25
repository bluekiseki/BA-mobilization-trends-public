import type { EventData, IconData } from '~/types/plannerData';

// --- Type Definitions ---
export type DreamMakerTab = 'overview' | 'calculator' | 'missions';
export type AvgPtDisplayMode = 'per_sim' | 'per_action' | 'per_day';
export type DreamMakerStrategy = 'mission_priority' | 'pt_optimal'; // Strategy names updated

export interface DreamMakerSimConfig {
  simRuns: number;
  targetLoops: number; // Represents total loops to simulate
  isFirstRun: boolean; // Replaced startLoop
  clearedFirstRewards: boolean; // Tracks if initial rewards are already claimed
  initialStats?: { [key: number]: number }; // Optional override for non-first runs
  strategy: DreamMakerStrategy;
}

// Result returned by the simulation engine
export interface DreamMakerSimResult {
  avgCost: Record<string, number>;
  avgRewards: Record<string, number>;
  avgEventPoints: number;
  avgFinalStats: Record<number, number>; // Stats at the end of the *last* simulated loop
  avgSpecialEndings: number; // Average count per simulation
  avgNormalEndings: number; // Average count per simulation
  avgActions: number; // Average total actions per simulation
  loopsDetail: Record<
    number,
    {
      // Loop number -> details (averaged across simulations)
      startStats: Record<number, number>;
      endStats: Record<number, number>;
      eventPoints: number;
      specialEndingRate: number; // Added per-loop success rate
    }
  >;
}

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

export const defaultDreamMakerConfig: DreamMakerSimConfig = {
  simRuns: 1000,
  targetLoops: 5,
  isFirstRun: true,
  clearedFirstRewards: false,
  strategy: 'pt_optimal', // Default to Pt optimal
};
