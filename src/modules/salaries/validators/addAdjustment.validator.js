import { z } from "zod";

export const addAdjustmentSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    type: z.enum(["bonus", "penalty", "advance", "deduction"]),
    amount: z.coerce.number().positive("Summa musbat bo'lishi kerak"),
    reason: z.string().max(300).optional(),
  }),
});
