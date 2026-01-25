import type { ReportEntry } from '~/components/dashboard/common';
import type { DifficultyName } from '~/components/Difficulty';

interface BossData {
  d: ReportEntry[];
}
export interface TierData {
  [boss: string]: Record<DifficultyName, number>;
}

interface BossTierData {
  [boss: string]: Partial<Record<DifficultyName, number>>;
}

export interface LastRaidData {
  boss: BossData;
  tier: Record<DifficultyName, number>;
}
export interface LastERaidData {
  total: {
    boss1: BossData;
    boss2: BossData;
    boss3: BossData;
  };
  boss1: BossData;
  boss2: BossData;
  boss3: BossData;
  tier: BossTierData;
}

export interface LastData {
  time: string;
  data: LastERaidData | LastRaidData;
}

export interface RaidTimelinePoint {
  time: string;
  data: {
    boss: { d: { r: number; s: number }[] };
    tier: Record<DifficultyName, number>;
  };
}

export interface ERaidTimelinePoint {
  time: string;
  data: {
    total: { r: number; s: number }[];
    boss1: { d: { r: number; s: number }[] };
    boss2: { d: { r: number; s: number }[] };
    boss3: { d: { r: number; s: number }[] };
    tier: TierData;
  };
}

export type TimelineData = RaidTimelinePoint[] | ERaidTimelinePoint[];

export interface DistributionData {
  [key: string]: { score: number; density: number }[];
}
