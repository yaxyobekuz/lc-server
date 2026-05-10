import { z } from "zod";

export const updateSchema = z.object({
  body: z
    .object({
      reminderEnabled: z.boolean().optional(),
      remindHourOfDay: z.coerce.number().int().min(0).max(23).optional(),
      overdueDaysThreshold: z.coerce.number().int().min(1).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
