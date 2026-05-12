import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    audience: z.enum(["all", "students", "teachers"]).optional(),
    includeInactive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "true")
      .optional(),
    includePast: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "true")
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
