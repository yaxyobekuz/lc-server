import { z } from "zod";

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      calculationType: z
        .enum(["fixed", "hourly", "percentage", "mixed"])
        .optional(),
      fixedAmount: z.coerce.number().min(0).optional(),
      hourlyRate: z.coerce.number().min(0).optional(),
      hoursPerSession: z.coerce.number().min(0).optional(),
      percentageRate: z.coerce.number().min(0).max(100).optional(),
      minMonthlyAmount: z.coerce.number().min(0).optional(),
      notes: z.string().max(300).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
