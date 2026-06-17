import { z } from 'zod';

export const customGameItemSchema = z.object({
  type: z.string(),
  id: z.string(),
  amount: z.number(),
});
export type CustomGameItem = z.infer<typeof customGameItemSchema>;
