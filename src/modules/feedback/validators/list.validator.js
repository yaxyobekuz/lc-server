import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    type: z.string().optional(),
    status: z
      .enum(["new", "in_review", "resolved", "rejected"])
      .optional(),
    search: z.string().optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const myListSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
