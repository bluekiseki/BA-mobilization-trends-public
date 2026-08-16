import type { ProfileServer } from '~/store/authStore';
import type { RaidTrophy } from './resourcePlan';

export interface RaidHistoryStudent {
  id: number;
  star?: number;
  hasWeapon?: boolean;
  weaponStar?: number;
  isAssist?: boolean;
  isMulligan?: boolean;
  mulliganIndex?: number;
  level?: number;
  equipment?: [number, number, number];
  skills?: { ex: number; normal: number; passive: number; sub: number };
  notes?: string;
}

export type RaidType = 'raid' | 'eraid' | 'jfd' | 'multifloor';

export type RaidHistoryServer = ProfileServer;

export interface RaidHistoryTeam {
  difficulty?: string;
  armorType?: string;
  score?: number;
  m: (RaidHistoryStudent | null)[];
  s: (RaidHistoryStudent | null)[];
  guideUrl?: string;
  noGuide?: boolean;
  notes?: string;
}

export interface RaidHistoryEntry {
  id: string;
  raidId: string;
  raidType: RaidType;
  server: RaidHistoryServer;
  date: string;
  difficulty?: string;
  trophy?: RaidTrophy;
  score?: number;
  rank?: number;
  floor?: number;
  clearTime?: string;
  teams?: RaidHistoryTeam[];
  m?: (RaidHistoryStudent | null)[];
  s?: (RaidHistoryStudent | null)[];
  guideUrl?: string;
  noGuide?: boolean;
  notes?: string;
}

export interface RaidHistoryData {
  entries: RaidHistoryEntry[];
}
