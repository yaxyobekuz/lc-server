import { z } from "zod";

export const monthsBackSchema = z.object({
  query: z.object({
    months: z.coerce.number().int().min(1).max(24).optional(),
  }),
});
