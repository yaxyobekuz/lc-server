import { z } from "zod";

export const recordPayoutSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    amount: z.coerce.number().positive("Summa musbat bo'lishi kerak"),
    methodId: z.string().min(1, "To'lov usuli kerak"),
    paidAt: z.coerce.date().optional(),
    note: z.string().max(300).optional(),
    // Dublikat payout'lardan himoya (S-2) — ixtiyoriy noyob kalit
    idempotencyKey: z.string().min(8).max(100).optional(),
  }),
});
