import { z } from "zod";

export const refundSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    amount: z.coerce.number().positive("Summa musbat bo'lishi kerak"),
    reason: z.string().max(300).optional(),
  }),
});
