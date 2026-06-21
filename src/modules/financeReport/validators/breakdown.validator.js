import { z } from "zod";

export const breakdownSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});
