import type { ReportEntry } from '~/types/raidReport';
import type { DifficultyName } from '~/utils/difficultyPolicy';

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

// `h` marks a record the upstream data provider flagged as suspected cheating.
interface TimelineScoreEntry {
  r: number;
  s: number;
  h?: boolean;
}

export interface RaidTimelinePoint {
  time: string;
  data: {
    boss: { d: TimelineScoreEntry[] };
    tier: Record<DifficultyName, number>;
  };
}

export interface ERaidTimelinePoint {
  time: string;
  data: {
    total: TimelineScoreEntry[];
    boss1: { d: TimelineScoreEntry[] };
    boss2: { d: TimelineScoreEntry[] };
    boss3: { d: TimelineScoreEntry[] };
    tier: TierData;
  };
}

export type TimelineData = RaidTimelinePoint[] | ERaidTimelinePoint[];

export interface ScoreDistributionData {
  [key: string]: { score: number; density: number }[];
}
