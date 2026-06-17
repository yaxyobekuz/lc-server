import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    groupId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    status: z.enum(["unpaid", "partial", "paid"]).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
  }),
});

export const obligationsSchema = z.object({
  query: z.object({
    groupId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000),
    // Ixtiyoriy: berilmasa - tanlangan yilning BARCHA oylari bo'yicha qarzdorlar.
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const studentIdParamSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
});
