// src/types/gacha.ts
import { z } from 'zod';

/*
 * Student Information Interface
 */
export const studentSchema = z.object({
  id: z.number(),
  name: z.string(),
  rarity: z.number(), // 1 | 2 | 3
  isLimited: z.boolean(),
  isFes: z.boolean(),
  releaseDate: z.number(),
  isRerun: z.boolean(),
});
export type Student = z.infer<typeof studentSchema>;

export const studentStrategyTypeSchema = z.union([z.literal('mandatory'), z.literal('conditional'), z.literal('skip')]);
export type StudentStrategyType = z.infer<typeof studentStrategyTypeSchema>;

/**
 * Individual gacha strategy settings per student
 */
export const studentStrategyConfigSchema = z.object({
  studentId: z.number(),
  /**
   * Pull Mode
   * - must: Proceed until acquired (within budget)
   * - opportunistic: Attempt only when specific conditions (e.g., remaining pulls to spark) are met
   * - skip: Do not attempt
   */
  mode: z.union([z.literal('must'), z.literal('opportunistic'), z.literal('skip')]),
  /** Priority (1~5): Determines which student to target first among multiple students in the same banner */
  priority: z.number(),
  /**
   * Conditional Pull Threshold (Opportunistic only)
   * E.g., "If there are only 50 pulls left until the pity (while pulling for others), recruit this one too."
   */
  opportunisticThreshold: z.number(),
  /** Intentional Spark: Whether to continue pulling until the Pity limit (200 pulls) even if the target student is acquired early */
  intentionalSpark: z.boolean(),
  /**
   * Intentional Pity Threshold
   * E.g., "If the target is acquired at 180 pulls, perform 20 more pulls to hit the pity."
   */
  intentionalSparkThreshold: z.number(),
});
export type StudentStrategyConfig = z.infer<typeof studentStrategyConfigSchema>;

/**
 * Overall gacha strategy settings per banner (pickup period)
 */
export const bannerStrategySchema = z.object({
  bannerId: z.string(),
  /** Whether there is a plan to pull during this banner period */
  isActive: z.boolean(),
  /**
   * Maximum Budget (in Spark units)
   * 1 allows up to 200 pulls, 2 allows up to 400 pulls
   */
  maxSparks: z.number(),
  /**
   * Minimum Guaranteed Pulls
   * Always perform this many pulls regardless of the result (e.g., for farming Eligma)
   */
  minPulls: z.number(),
  /**
   * Individual settings for each student in the banner
   * Key: StudentID (stored as string in JSON)
   */
  studentConfigs: z.record(z.string(), studentStrategyConfigSchema),
  // Global banner settings
  maxPulls: z.number(), // Maximum spark count (e.g., 200, 400, 600...)
  isFes: z.boolean(),
  freePulls: z.number(), // Manually entered free pulls (default: 0)
  // Special options
  excludeFesSpooks: z.array(z.number()).optional(), // List of IDs for previous FES characters not appearing in the current FES
});
export type BannerStrategy = z.infer<typeof bannerStrategySchema>;

export const bannerPeriodSchema = z.object({
  id: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  // Banner attributes (automatically calculated)
  isFes: z.boolean(), // Includes students with fest=true
  isLimitedBanner: z.boolean(), // Includes students with limited=true
  isRerunBanner: z.boolean(), // When all pickup students have rerun=true
  isRecall: z.boolean(),
  // Benefits and rules
  freePulls: z.number(), // Auto-calculated: 100 assigned by adjacent FES logic
  excludedFesId: z.array(z.number()), // Retrieved from gachaRules (exclusion list for specific FES)
  pickupStudents: z.array(studentSchema),
});
export type BannerPeriod = z.infer<typeof bannerPeriodSchema>;
