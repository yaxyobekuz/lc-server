import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    studentId: z.string().optional(),
    isActive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "true")
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
