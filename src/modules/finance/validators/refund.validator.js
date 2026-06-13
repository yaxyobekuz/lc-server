import { z } from "zod";

// Qaytarilishi kerak bo'lgan (pending) ro'yxat filtri
export const pendingSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
  }),
});

// Qaytarilgan refundlar tarixi filtri
export const historySchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
  }),
});

// "Qaytarish" tugmasi bosilganda
export const createSchema = z.object({
  body: z.object({
    paymentId: z.string({ required_error: "To'lov kerak" }).min(1),
    note: z.string().trim().max(300).optional(),
  }),
});
