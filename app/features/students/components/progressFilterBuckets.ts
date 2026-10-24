import { MAX_LEVEL } from '../../../utils/student/const';

interface Bucket<K extends string> {
  key: K;
  min: number;
  max: number;
}

export type LevelRangeKey = '90' | '80-89' | '70-79' | '60-69' | '50-59' | '40-49' | '30-39' | '20-29' | '10-19' | '1-9';
export const LEVEL_BUCKETS: readonly Bucket<LevelRangeKey>[] = [
  { key: '90', min: MAX_LEVEL, max: MAX_LEVEL },
  { key: '80-89', min: 80, max: 89 },
  { key: '70-79', min: 70, max: 79 },
  { key: '60-69', min: 60, max: 69 },
  { key: '50-59', min: 50, max: 59 },
  { key: '40-49', min: 40, max: 49 },
  { key: '30-39', min: 30, max: 39 },
  { key: '20-29', min: 20, max: 29 },
  { key: '10-19', min: 10, max: 19 },
  { key: '1-9', min: 1, max: 9 },
];
export function findLevelBucketKey(level: number): LevelRangeKey | undefined {
  return LEVEL_BUCKETS.find((b) => level >= b.min && level <= b.max)?.key;
}

export type AffectionRangeKey = '100' | '50-99' | '20-49' | '10-19' | '1-9';
export const AFFECTION_BUCKETS: readonly Bucket<AffectionRangeKey>[] = [
  { key: '100', min: 100, max: 100 },
  { key: '50-99', min: 50, max: 99 },
  { key: '20-49', min: 20, max: 49 },
  { key: '10-19', min: 10, max: 19 },
  { key: '1-9', min: 1, max: 9 },
];
export function findAffectionBucketKey(affection: number): AffectionRangeKey | undefined {
  return AFFECTION_BUCKETS.find((b) => affection >= b.min && affection <= b.max)?.key;
}
