import { z } from "zod";
import { dateInputSchema } from "./shared.js";

export const rangeQuerySchema = z.object({
  query: z.object({
    fromDate: dateInputSchema,
    toDate: dateInputSchema,
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  }),
});

export const studentRangeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    fromDate: dateInputSchema,
    toDate: dateInputSchema,
  }),
});

export const groupRangeSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    fromDate: dateInputSchema,
    toDate: dateInputSchema,
  }),
});
