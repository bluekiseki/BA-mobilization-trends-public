import type { Student } from '~/types/data';

export interface Character {
  id: number;
  level: number;
  star: number;
  hasWeapon: boolean;
  weaponStar: number;
  isAssist: boolean;
  isMulligan?: boolean;
  mulliganIndex?: number;
  CombatStyleIndex?: number;
}

export interface Team {
  m: Character[];
  s: Character[];
}

export interface ReportEntry {
  r: number;
  s: number;
  t: Team[];
  // The upstream data provider flagged this record as suspected cheating. Hidden by default on /live.
  h?: boolean;
}

export interface ReportEntryRank extends ReportEntry {
  typeRanking: number;
}

export type ReportStudentData = Record<number, Student>;

export type PortraitData = Record<number, string>;

// New type for portrait data
export type UsageStats = Map<number, { total: number; stars: Map<number, number> }>;

export interface StudentConditionBase {
  id: number;
  starValues: number[];
}

export interface IncludableStudentCondition extends StudentConditionBase {
  mustBeIncluded: boolean;
  usage: InclusionUsage;
}

export interface ExcludableStudentCondition {
  id: number;
  isHardExclude: boolean;
}

export interface TableFilters {
  includable: IncludableStudentCondition[];
  excludable: ExcludableStudentCondition[];
  usePartyCount?: boolean;
  minParty?: number;
  maxParty?: number;
}

export enum InclusionUsage {
  Twice = 0, // Rent twice with assist (with my student)
  // Once = 1, // Delete
  Any = 2, // Simple filtering
  Assist = 3, // must loan students as assist (my students may or may not be present)
}
