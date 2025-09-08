// app/types/data.ts

import { DifficultyName } from "../components/Difficulty";

// The interface of initial data row after parsing the TSV file
export interface RawDataRow {
  x: number;
  y: number;
  z: number;
  w: number;
  diffculty: DifficultyName;
}

// The interface after dividing the y value by the interval
export interface BinnedDataRow {
  x: number;
  y_prime: string; // y changed to interval (e.g., "0-499")
  z: number;
  w: number;
  diffculty: DifficultyName;
}

// Interface of final chart data to be passed to Plotly
export interface ChartData {
  heatmap: {
    x: string[]; // number[] -> string[]
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
  Position: "Back'| 'Front'| 'Middle"
  SquadType: "Main" | "Support"
  TacticRole: "DamageDealer'| 'Healer'| 'Supporter'| 'Tanker'| 'Vehicle"
  School: string
  BulletType: 'Explosion'|'Mystic'| 'Pierce'| 'Sonic'
  Portrait: string
}



export interface RaidInfo {
  Id: string
  Boss: string
  Type?: string
  Date: string
  Location: string
  Alias: string,
  MaxLv: number,
  Cnt: {
    All: number,
    Lunatic: number,
    Torment: number,
    Insane: number,
    Extrime?: number
  }
}