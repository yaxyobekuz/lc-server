import { z } from "zod";

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// Maosh stavkasi maydonlari (davr o'zida saqlaydi).
const salaryRate = {
  salaryType: z.enum(["fixed", "percent", "mixed"]).optional(),
  fixedAmount: z.coerce.number().min(0).optional(),
  percentRate: z.coerce.number().min(0).max(100).optional(),
};

export const listSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const createSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    teacher: z.string().min(1),
    startDate: z.string().regex(DATE_RX, "Sana formati YYYY-MM-DD bo'lishi kerak"),
    endDate: z.string().regex(DATE_RX).nullable().optional(),
    ...salaryRate,
  }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1), periodId: z.string().min(1) }),
  body: z.object({
    startDate: z.string().regex(DATE_RX).optional(),
    endDate: z.string().regex(DATE_RX).nullable().optional(),
    ...salaryRate,
  }),
});

export const removeSchema = z.object({
  params: z.object({ id: z.string().min(1), periodId: z.string().min(1) }),
});
