import { z } from "zod";

export const dashboardSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});

export const trendSchema = z.object({
  query: z.object({
    months: z.coerce.number().int().min(1).max(24).optional(),
  }),
});

export const myHistorySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
