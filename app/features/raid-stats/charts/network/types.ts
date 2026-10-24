// [lo, hi_or_null, edges:[a,b,count][], nodes:[id,count][]]
export type SeasonInterval = [number, number | null, [number, number, number][], [number, number][]];

export interface SeasonData {
  date: string | null;
  diffCutoffs: Record<string, number>;
  intervals: SeasonInterval[];
}

export interface RaidSeasonMeta {
  season: number;
  threshold: number;
  tag: string | null;
  file: string;
  aggFile: string | null;
  boss: string | null;
  location: string | null;
  date: string | null;
  cnt: Record<string, number> | null;
  diffCutoffs: Record<string, number>;
}

export interface EraidSeasonMeta {
  season: number;
  threshold: number;
  bossKey: string;
  boss: string;
  location: string;
  armor: string;
  file: string;
  date: string | null;
  cnt: Record<string, number> | null;
  diffCutoffs: Record<string, number>;
}

export interface NetworkIndex {
  raid: RaidSeasonMeta[];
  eraid: EraidSeasonMeta[];
}

export interface SeasonItem {
  id: string;
  label: string;
  bossKey: string;
  date: string;
  tag: 'raid' | 'eraid';
  files: string[];
  aggFile: string | null;
  cnt: Record<string, number> | null;
  diffCutoffs: Record<string, number>;
}

export interface NetworkNode {
  id: number;
  name: string;
  portrait: string;
  totalAppearances: number;
}

export interface NetworkEdge {
  source: number;
  target: number;
  weight: number;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  nodeTotalWeights: Map<number, number>;
}

export interface NetworkFilters {
  selectedSeasons: string[];
  armorTypes: string[] | null;
  rankCutoff: number | null;
  difficulty: string | null;
  minWeight: number;
  maxNodes: number;
  topNPerNode: number | null;
}

export const DEFAULT_FILTERS: NetworkFilters = {
  selectedSeasons: [],
  armorTypes: null,
  rankCutoff: null,
  difficulty: null,
  minWeight: 10,
  maxNodes: 50,
  topNPerNode: null,
};
