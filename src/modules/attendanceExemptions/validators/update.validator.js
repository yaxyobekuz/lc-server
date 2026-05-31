import { z } from "zod";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().nullable().optional(),
      daysOfWeek: z.array(z.enum(DAYS)).optional(),
      reason: z.string().max(300).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
