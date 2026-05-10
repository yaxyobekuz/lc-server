import { z } from "zod";

export const calculateSchema = z.object({
  body: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
    teacherId: z.string().optional(),
  }),
});
