import { z } from 'zod';
import { apCalculatorConfigSchema } from '~/types/minigame/apCalculator';
import { cardShopConfigSchema } from '~/types/minigame/cardShop';
import { diceRaceSimConfigSchema } from '~/types/minigame/diceRace';
import { treasureSimConfigSchema } from '~/types/minigame/treasure';
import { fortuneGachaAvgRatesSchema } from '~/types/minigame/fortuneGacha';
import { dreamMakerSimConfigSchema, dreamMakerSimResultSchema } from '~/types/minigame/dreamMaker';
import { cardMatchSimConfigSchema } from '~/types/minigame/cardMatch';
import { clueSearchConfigSchema } from '~/types/minigame/clueSearch';
import { fieldEventConfigSchema } from '~/types/minigame/fieldEvent';
import { ccgRunInputSchema } from '~/types/minigame/ccg';
import { customGameItemSchema } from '~/types/minigame/customGame';
import { interactiveWorldRaidConfigSchema } from '~/types/minigame/interactiveWorldRaid';
import { roadPuzzleConfigSchema } from '~/types/minigame/roadPuzzle';

export const stagePrioSchema = z.enum(['include', 'exclude', 'priority']);
export type StagePrio = z.infer<typeof stagePrioSchema>;

export const eventPlanSchema = z.object({
  selectedStudents: z.array(z.string()),
  ownedCurrency: z.record(z.string(), z.number()),
  purchaseCounts: z.record(z.string(), z.number()),
  alreadyPurchasedCounts: z.record(z.string(), z.number()),
  runCounts: z.record(z.string(), z.number()),
  firstClears: z.record(z.string(), z.boolean()),
  stagePrio: z.record(z.string(), stagePrioSchema),
  priorityItemId: z.number().nullable().optional(),
  completedMissions: z.array(z.number()),
  minigameMissionStatus: z.record(z.string(), z.boolean()),
  durationDays: z.number(),
  apConfig: apCalculatorConfigSchema,
  totalRewardCurrentAmount: z.number(),
  totalRewardTargetAmount: z.number(),
  finalCardFlips: z.number().optional(),
  treasureStartRound: z.number().optional(),
  treasureEndRound: z.number().optional(),
  treasureFinalTotalRounds: z.number().optional(),
  treasureSimConfig: treasureSimConfigSchema.optional(),
  boxGachaStartBox: z.number().optional(),
  boxGachaEndBox: z.number().optional(),
  boxGachaFinalTotalBoxes: z.number().optional(),
  customGamePlays: z.number().optional(),
  customGameCost: customGameItemSchema.nullable().optional(),
  customGameRewards: z.array(customGameItemSchema).optional(),
  customGameOneTimeRewards: z.array(customGameItemSchema).optional(),
  cardShopConfig: cardShopConfigSchema.optional(),
  diceRaceSimConfig: diceRaceSimConfigSchema.optional(),
  fortuneGachaSimRuns: z.number().optional(),
  fortuneGachaFinalPulls: z.number().optional(),
  fortuneGachaAvgRates: fortuneGachaAvgRatesSchema.nullable().optional(),
  dreamMakerSimConfig: dreamMakerSimConfigSchema.optional(),
  dreamMakerClaimedMissions: z.array(z.number()).optional(),
  dreamMakerInteractiveResult: dreamMakerSimResultSchema.nullable().optional(),
  minigameCCGConfig: z.array(ccgRunInputSchema).optional(),
  cardMatchSimConfig: cardMatchSimConfigSchema.nullable().optional(),
  clueSearchConfig: clueSearchConfigSchema.optional(),
  fieldEventConfig: fieldEventConfigSchema.optional(),
  interactiveWorldRaidConfig: interactiveWorldRaidConfigSchema.optional(),
  roadPuzzleConfig: roadPuzzleConfigSchema.optional(),
});

export type EventPlan = z.infer<typeof eventPlanSchema>;
