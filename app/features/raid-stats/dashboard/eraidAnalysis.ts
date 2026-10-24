import {
  ANALYSIS_TIERS,
  type AnalysisFilters,
  type AnalysisHistogramQuery,
  type AnalysisHistogramResult,
  type AnalysisResult,
  type ArmorType,
  type ERaidCombinationIndexV1,
  type TierName,
} from './types/eraidAnalysis.ts';
import { orderedCombination, compareCombinations, DIFFICULTY_ORDER, getBracketFromTotalScore } from '../../../utils/difficultyPolicy.ts';

export function validateCombinationIndex(value: unknown, server: string, season: string, count: number): ERaidCombinationIndexV1 {
  const index = value as ERaidCombinationIndexV1;
  const armors: ArmorType[] = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor', 'CompositeArmor'];
  if (
    !index ||
    index.schemaVersion !== 1 ||
    index.server !== server ||
    index.season !== season ||
    !Array.isArray(index.armorTypes) ||
    index.armorTypes.length !== 3 ||
    new Set(index.armorTypes).size !== 3 ||
    index.armorTypes.some((a) => !armors.includes(a)) ||
    !/^[a-f0-9]{64}$/.test(index.baseScoresSha256) ||
    !Array.isArray(index.profiles) ||
    index.profiles.length > 729 ||
    !Array.isArray(index.profileIds) ||
    index.profileIds.length !== count
  )
    throw new Error('index-format');
  for (const profile of index.profiles) {
    if (!Array.isArray(profile) || profile.length !== 3 || profile.some((d) => d !== null && !DIFFICULTY_ORDER.includes(d))) throw new Error('index-profile');
  }
  for (const id of index.profileIds) {
    if (!Number.isInteger(id) || id < 0 || id >= index.profiles.length) throw new Error('index-profile-id');
  }
  return index;
}

export async function scoresSha256(scores: Int32Array): Promise<string> {
  const bytes = new ArrayBuffer(scores.length * 4);
  const view = new DataView(bytes);
  for (let i = 0; i < scores.length; i++) view.setInt32(i * 4, scores[i], true);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
}

export function getAnalysisTier(rank: number, tiers: Record<string, number>): TierName {
  let boundary = 0;
  for (const [i, key] of ['4', '3', '2'].entries()) {
    boundary += tiers[key] || 0;
    if (rank <= boundary) return ANALYSIS_TIERS[i];
  }
  return 'Bronze';
}

export function aggregateCombinationHistogram(
  scores: Int32Array,
  ids: Uint16Array,
  profiles: ERaidCombinationIndexV1['profiles'],
  tierCounter: Record<string, number>,
  query: AnalysisHistogramQuery,
): AnalysisHistogramResult {
  if (!Number.isFinite(query.binSize) || query.binSize < 1 || !Number.isFinite(query.baseScore)) throw new Error('histogram-range');
  const names = profiles.map(orderedCombination);
  const visible = new Set(query.visibleBrackets);
  const bins = new Map<number, { count: number; scoreMin: number; scoreMax: number; rankMin: number; rankMax: number }>();
  let matchedCount = 0;
  for (let i = 0; i < scores.length; i++) {
    if (names[ids[i]] !== query.combination) continue;
    const score = scores[i],
      rank = i + 1,
      bracket = getBracketFromTotalScore(score);
    if ((query.tier && getAnalysisTier(rank, tierCounter) !== query.tier) || (query.bracket && bracket !== query.bracket) || !visible.has(bracket)) continue;
    if (query.useScoreFilter ? score < query.scoreMin || score > query.scoreMax : rank < query.rankMin || rank > query.rankMax) continue;
    const binStart = query.baseScore + Math.floor((score - query.baseScore) / query.binSize) * query.binSize;
    const bin = bins.get(binStart);
    if (bin) {
      bin.count++;
      bin.scoreMin = Math.min(bin.scoreMin, score);
      bin.scoreMax = Math.max(bin.scoreMax, score);
      bin.rankMin = Math.min(bin.rankMin, rank);
      bin.rankMax = Math.max(bin.rankMax, rank);
    } else {
      bins.set(binStart, { count: 1, scoreMin: score, scoreMax: score, rankMin: rank, rankMax: rank });
    }
    matchedCount++;
  }
  return { combination: query.combination, matchedCount, bins: Array.from(bins, ([binStart, bin]) => ({ binStart, ...bin })).sort((a, b) => b.binStart - a.binStart) };
}

/** Aggregate armor-ordered combinations for the existing donut. */
export function aggregateCombinations(
  scores: Int32Array,
  ids: Uint16Array,
  profiles: ERaidCombinationIndexV1['profiles'],
  tierCounter: Record<string, number>,
  filters: AnalysisFilters,
): Omit<AnalysisResult, 'armorTypes'> {
  const profileNames = profiles.map(orderedCombination);
  const combinations = new Map<string, { count: number; min: number; max: number; sum: number }>();
  let recordCount = 0;
  for (let i = 0; i < scores.length; i++) {
    const score = scores[i];
    if ((filters.tier && getAnalysisTier(i + 1, tierCounter) !== filters.tier) || (filters.bracket && getBracketFromTotalScore(score) !== filters.bracket)) continue;
    recordCount++;
    const combination = profileNames[ids[i]];
    const group = combinations.get(combination);
    if (group) {
      group.count++;
      group.min = Math.min(group.min, score);
      group.max = Math.max(group.max, score);
      group.sum += score;
    } else combinations.set(combination, { count: 1, min: score, max: score, sum: score });
  }
  return {
    summary: { recordCount, combinationCount: combinations.size },
    combinations: Array.from(combinations, ([combination, { count, min, max, sum }]) => ({ combination, count, min, max, average: sum / count })).sort(
      (a, b) => b.average - a.average || compareCombinations(a.combination, b.combination),
    ),
  };
}
