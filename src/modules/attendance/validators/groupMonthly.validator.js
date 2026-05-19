import { z } from "zod";

export const groupMonthlySchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  }),
});
