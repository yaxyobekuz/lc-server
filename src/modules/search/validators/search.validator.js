import { z } from "zod";

export const searchSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  }),
});
