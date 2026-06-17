import { z } from 'zod';

export const cardShopStrategySchema = z.enum(['sr-reset', 'all-open', 'one-open']);
export type CardShopStrategy = z.infer<typeof cardShopStrategySchema>;

export const cardShopConfigSchema = z.object({
  rounds: z.number(),
  strategy: cardShopStrategySchema,
});
export type CardShopConfig = z.infer<typeof cardShopConfigSchema>;
