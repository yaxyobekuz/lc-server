import { z } from "zod";

export const studentMonthlySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  }),
});

export const studentYearSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
  }),
});
