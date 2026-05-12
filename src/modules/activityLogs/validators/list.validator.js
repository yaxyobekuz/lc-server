import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    userId: z.string().optional(),
    method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]).optional(),
    resourceType: z.string().optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const rangeSchema = z.object({
  query: z.object({
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
  }),
});
