import { z } from "zod";

export const updateSchema = z.object({
  body: z
    .object({
      dueDayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
      remindBeforeDays: z.coerce.number().int().min(0).optional(),
      repeatAfterOverdueDays: z.coerce.number().int().min(0).optional(),
      reminderEnabled: z.boolean().optional(),
      centerName: z.string().min(1).max(120).optional(),
      groupPriceChangeMode: z
        .enum(["future_only", "current_unpaid", "include_paid"])
        .optional(),
      teacherAbsenceMode: z.enum(["auto", "fixed", "none"]).optional(),
      teacherAbsenceAmount: z.coerce.number().min(0).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
