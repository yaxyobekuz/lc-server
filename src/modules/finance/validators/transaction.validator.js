import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    paymentId: z.string({ required_error: "To'lov kerak" }).min(1),
    amount: z.coerce
      .number()
      .int()
      .positive("Summa musbat bo'lishi kerak")
      .max(50_000_000, "Summa 50 000 000 dan oshmasligi kerak"),
    method: z.enum(["cash", "card"], { required_error: "To'lov turini tanlang" }),
    paidAt: z.string().optional(),
    note: z.string().trim().max(300).optional(),
    // Double-click/retry himoyasi uchun kliyent yaratadigan takrorlanmas kalit
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});
