import { z } from "zod";

export const recordSchema = z.object({
  body: z.object({
    invoiceId: z.string().min(1, "Hisob kerak"),
    amount: z.coerce
      .number()
      .int("Summa butun son bo'lishi kerak")
      .positive("Summa musbat bo'lishi kerak"),
    methodId: z.string().min(1, "To'lov usuli kerak"),
    paidAt: z.coerce.date().optional(),
    note: z.string().max(300).optional(),
    // Dublikat to'lovlardan himoya (P-4) — ixtiyoriy noyob kalit
    idempotencyKey: z.string().min(8).max(100).optional(),
  }),
});
