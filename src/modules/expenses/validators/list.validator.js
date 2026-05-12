import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    category: z.enum(["salary", "rent", "utility", "ads", "other"]).optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
