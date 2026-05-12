import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    source: z.string().optional(),
    direction: z.string().optional(),
    assignedTo: z.string().optional(),
    search: z.string().optional(),
    hasFollowUp: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "true")
      .optional(),
    overdue: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "true")
      .optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
