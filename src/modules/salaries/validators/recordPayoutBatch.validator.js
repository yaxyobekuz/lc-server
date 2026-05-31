import { z } from "zod";

export const recordPayoutBatchSchema = z.object({
  body: z.object({
    salaryIds: z
      .array(z.string().min(1))
      .min(1, "Kamida bitta oylik tanlang"),
    amount: z.coerce.number().positive("Summa musbat bo'lishi kerak").optional(),
    methodId: z.string().min(1, "To'lov usuli kerak"),
    paidAt: z.coerce.date().optional(),
    note: z.string().max(300).optional(),
  }),
});
