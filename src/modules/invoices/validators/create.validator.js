import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    student: z.string().min(1),
    group: z.string().min(1),
    membership: z.string().optional(),
    period: z.object({
      year: z.coerce.number().int().min(2000).max(2100),
      month: z.coerce.number().int().min(1).max(12),
    }),
    baseAmount: z.coerce.number().min(0).optional(),
    discountAmount: z.coerce.number().min(0).optional(),
    dueDate: z.coerce.date().optional(),
    notes: z.string().max(500).optional(),
  }),
});
