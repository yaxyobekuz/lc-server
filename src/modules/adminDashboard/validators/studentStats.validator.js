import { z } from "zod";

export const studentStatsSchema = z.object({
  query: z.object({
    // Trend grafigi nechta oyni qamrasin (default 12).
    months: z.coerce.number().int().min(1).max(24).optional(),
    // So'nggi ro'yxatga olinganlar ro'yxati uzunligi (default 8).
    recentLimit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});
