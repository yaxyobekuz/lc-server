import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    teacherId: z.string().optional(),
    archived: z.enum(["0", "1", "true", "false"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
