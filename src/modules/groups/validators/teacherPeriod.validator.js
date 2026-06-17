import { z } from "zod";

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

export const listSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const createSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    teacher: z.string().min(1),
    startDate: z.string().regex(DATE_RX, "Sana formati YYYY-MM-DD bo'lishi kerak"),
    endDate: z.string().regex(DATE_RX).nullable().optional(),
  }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1), periodId: z.string().min(1) }),
  body: z.object({
    startDate: z.string().regex(DATE_RX).optional(),
    endDate: z.string().regex(DATE_RX).nullable().optional(),
  }),
});

export const removeSchema = z.object({
  params: z.object({ id: z.string().min(1), periodId: z.string().min(1) }),
});
