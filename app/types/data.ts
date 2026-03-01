// app/types/data.ts

import type { DifficultyName } from '~/components/Difficulty';

// The interface of initial data row after parsing the TSV file
export interface RawDataRow {
  x: number;
  y: number;
  z: number;
  w: number;
  difficulty: DifficultyName;
}

// The interface after dividing the y value by the interval
export interface BinnedDataRow {
  x: number;
  y_prime: string; // y changed to interval (e.g., "0-499")
  z: number;
  w: number;
  difficulty: DifficultyName;
}

// Interface of final chart data to be passed to Plotly
export interface ChartData {
  heatmap: {
    x: string[]; // number[] -> string[]
    x_show: string[];
    y: string[];
    z: (number | null)[][];
  };
  topBar: {
    x: string[]; // number[] -> string[]
    values: number[];
  };
  rightBar: {
    y: string[];
    values: number[];
  };
}

export interface Student {
  Name: string;
  SearchTags: string[];
  Position: "Back'| 'Front'| 'Middle";
  SquadType: 'Main' | 'Support';
  TacticRole: "DamageDealer'| 'Healer'| 'Supporter'| 'Tanker'| 'Vehicle";
  School: string;
  BulletType: 'Explosion' | 'Mystic' | 'Pierce' | 'Sonic' | 'Chemical';
  Portrait?: string;
  CombatStyleIndex?: 1 | 2; // for hosino
  FamilyName?: string;
  BirthDay: string;
  Id: number;
}

export interface RaidInfo {
  Id: string;
  Boss: string;
  Type?: 'LightArmor' | 'HeavyArmor' | 'Unarmed' | 'ElasticArmor' | 'CompositeArmor';
  Date: string;
  Location: string;
  Alias?: string;
  MaxLv: number;
  Cnt: {
    All: number;
    Lunatic: number;
    Torment: number;
    Insane: number;
    Extreme?: number;
    Hardcore?: number;
    Veryhard?: number;
    Hard?: number;
    Normal?: number;
  };
}

export interface RaidFullInfo extends RaidInfo {
  Platinum: number;
  Tier: { '4'?: number; '3'?: number; '2'?: number; '1'?: number };
  TotalParticipants?: number;
}

export interface RaidInfoFiltered extends RaidInfo {
  index: number;
}

export type GameServerParams = {
  server: GameServer;
};

export type GameServer = 'jp' | 'kr';

export const GAMESERVER_LIST: GameServer[] = ['jp', 'kr'];

export interface FullData {
  tier_counter: { [key: string]: number };
  rank: Int32Array;
  rank_1?: Int32Array;
  rank_2?: Int32Array;
  rank_3?: Int32Array;
  rank_default?: Int32Array;
}
