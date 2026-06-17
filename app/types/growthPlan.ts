import { z } from 'zod';

const statBlockSchema = z.object({
  level: z.number(),
  star: z.number(),
  uw: z.number(),
  uwLevel: z.number(),
  ex: z.number(),
  normal: z.number(),
  passive: z.number(),
  sub: z.number(),
  affection: z.number(),
  equipment: z.tuple([z.number(), z.number(), z.number()]),
  gear: z.number(),
  potential: z.object({ hp: z.number(), atk: z.number(), heal: z.number() }),
});

export const growthPlanSchema = z.object({
  uuid: z.string(),
  studentId: z.number().nullable(),
  current: statBlockSchema.extend({ eleph: z.number(), affectionExp: z.number() }),
  target: statBlockSchema,
  includedInEvents: z.array(z.number()),
  useEligmaForStar: z.boolean(),
  eligmaInfo: z.object({ price: z.number(), stock: z.number() }),
  isSelected: z.boolean(),
  acquiredDate: z.string().optional(),
});

export type GrowthPlan = z.infer<typeof growthPlanSchema>;
