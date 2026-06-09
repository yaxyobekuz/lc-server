import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    status: z.enum(["all", "read", "unread"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
