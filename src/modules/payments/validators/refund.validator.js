import { z } from "zod";

export const refundSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    amount: z.coerce
      .number()
      .int("Summa butun son bo'lishi kerak")
      .positive("Summa musbat bo'lishi kerak"),
    reason: z.string().trim().min(3, "Sabab kamida 3 belgi").max(300),
  }),
});
