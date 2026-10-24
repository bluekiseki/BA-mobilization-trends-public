import type { DifficultyName } from '../../../../utils/difficultyPolicy';

export type TierName = 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
export const ANALYSIS_TIERS: TierName[] = ['Platinum', 'Gold', 'Silver', 'Bronze'];
export type ArmorType = 'LightArmor' | 'HeavyArmor' | 'Unarmed' | 'ElasticArmor' | 'CompositeArmor';
export type DifficultyProfile = [DifficultyName | null, DifficultyName | null, DifficultyName | null];
export interface ERaidCombinationIndexV1 {
  schemaVersion: 1;
  server: 'jp' | 'kr';
  season: string;
  armorTypes: [ArmorType, ArmorType, ArmorType];
  baseScoresSha256: string;
  profiles: DifficultyProfile[];
  profileIds: number[];
}
export interface AnalysisFilters {
  tier: TierName | null;
  bracket: string | null;
}
export interface CombinationStats {
  combination: string;
  count: number;
  min: number;
  max: number;
  average: number;
}
export interface AnalysisResult {
  armorTypes: [ArmorType, ArmorType, ArmorType];
  summary: { recordCount: number; combinationCount: number };
  combinations: CombinationStats[];
}
export interface AnalysisHistogramQuery {
  combination: string;
  tier: TierName | null;
  bracket: string | null;
  rankMin: number;
  rankMax: number;
  scoreMin: number;
  scoreMax: number;
  useScoreFilter: boolean;
  binSize: number;
  baseScore: number;
  visibleBrackets: string[];
}
export interface AnalysisHistogramResult {
  combination: string;
  matchedCount: number;
  bins: { binStart: number; count: number; scoreMin: number; scoreMax: number; rankMin: number; rankMax: number }[];
}
export type AnalysisWorkerRequest =
  | { type: 'init'; requestId: number; url: string; server: 'jp' | 'kr'; season: string; scores: Int32Array; tierCounter: Record<string, number>; filters: AnalysisFilters; reload: boolean }
  | { type: 'filter'; requestId: number; filters: AnalysisFilters }
  | { type: 'histogram'; requestId: number; query: AnalysisHistogramQuery | null };
export type AnalysisWorkerResponse =
  | { status: 'ready'; requestId: number; data: AnalysisResult }
  | { status: 'histogram'; requestId: number; data: AnalysisHistogramResult | null }
  | { status: 'error'; requestId: number; error: string };
