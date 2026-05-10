import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    teacherId: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});
