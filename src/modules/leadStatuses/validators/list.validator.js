import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    includeInactive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
