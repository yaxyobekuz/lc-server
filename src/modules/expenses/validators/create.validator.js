import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    type: z.string().min(1, "Xarajat turi kerak"),
    amount: z.coerce.number().positive("Summa musbat bo'lishi kerak"),
    date: z.coerce.date().optional(),
    description: z.string().max(500).optional(),
  }),
});
