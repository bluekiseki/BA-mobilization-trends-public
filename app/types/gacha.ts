// src/types/gacha.ts

/*
 * Student Information Interface
 */
export interface Student {
  id: number;
  name: string;
  rarity: number; // 1 | 2 | 3
  isLimited: boolean;
  isFes: boolean;
  releaseDate: number;
  isRerun: boolean;
}

export type StudentStrategyType = 'mandatory' | 'conditional' | 'skip';

/**
 * Individual gacha strategy settings per student
 */
export interface StudentStrategyConfig {
  studentId: number;
  /** * Pull Mode
   * - must: Proceed until acquired (within budget)
   * - opportunistic: Attempt only when specific conditions (e.g., remaining pulls to spark) are met
   * - skip: Do not attempt
   */
  mode: 'must' | 'opportunistic' | 'skip';

  /** Priority (1~5): Determines which student to target first among multiple students in the same banner */
  priority: number;

  /** * Conditional Pull Threshold (Opportunistic only)
   * E.g., "If there are only 50 pulls left until the pity (while pulling for others), recruit this one too."
   */
  opportunisticThreshold: number;

  /** Intentional Spark: Whether to continue pulling until the Pity limit (200 pulls) even if the target student is acquired early */
  intentionalSpark: boolean;

  /** * Intentional Pity Threshold
   * E.g., "If the target is acquired at 180 pulls, perform 20 more pulls to hit the pity."
   */
  intentionalSparkThreshold: number;
}

/**
 * Overall gacha strategy settings per banner (pickup period)
 */
export interface BannerStrategy {
  bannerId: string;
  /** Whether there is a plan to pull during this banner period */
  isActive: boolean;

  /** * Maximum Budget (in Spark units)
   * 1 allows up to 200 pulls, 2 allows up to 400 pulls
   */
  maxSparks: number;

  /** * Minimum Guaranteed Pulls
   * Always perform this many pulls regardless of the result (e.g., for farming Eligma)
   */
  minPulls: number;

  /** * Individual settings for each student in the banner
   * Key: StudentID
   */
  studentConfigs: Record<number, StudentStrategyConfig>;
}

export interface TargetConfig {
  studentId: number;
  name: string; // For handling missing data names
  strategyType: StudentStrategyType;
  conditionalThreshold: number; // For conditional mode: Number of pulls remaining until spark (e.g., 20)
  priority: number; // Spark exchange priority
}

export interface BannerStrategy {
  bannerId: string;
  isActive: boolean;

  // Global banner settings
  maxPulls: number; // Maximum spark count (e.g., 200, 400, 600...)
  isFes: boolean;
  freePulls: number; // Manually entered free pulls (default: 0)

  // Target settings
  targets: TargetConfig[];

  // Special options
  excludeFesSpooks?: number[]; // List of IDs for previous FES characters not appearing in the current FES
}

export interface SimulationResult {
  pulls: number;
  usedPyroxenes: number;
  totalEligma: number;
  obtainedStudentIds: number[];
  sparkCounts: number;
  isSuccess: boolean;
}

export interface BannerPeriod {
  id: string;
  startTime: string;
  endTime: string;

  // Banner attributes (automatically calculated)
  isFes: boolean; // Includes students with fast=true
  isLimitedBanner: boolean; // Includes students with limited=true
  isRerunBanner: boolean; // When all pickup students have rerun=true
  isRecall: boolean;

  // Benefits and rules
  freePulls: number; // Auto-calculated: 100 assigned by adjacent FES logic
  excludedFesId: number[]; // Retrieved from gachaRules (exclusion list for specific FES)

  pickupStudents: Student[];
}
