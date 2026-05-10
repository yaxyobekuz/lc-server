import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    teacherId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    status: z
      .enum(["calculated", "approved", "partial", "paid", "cancelled"])
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});
