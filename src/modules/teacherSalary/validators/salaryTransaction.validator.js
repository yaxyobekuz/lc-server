import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    salaryId: z.string({ required_error: "Maosh kerak" }).min(1),
    amount: z.coerce.number().int().positive("Summa musbat bo'lishi kerak"),
    method: z.enum(["cash", "card"], { required_error: "To'lov turini tanlang" }),
    paidAt: z.string().optional(),
    note: z.string().trim().max(300).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});
