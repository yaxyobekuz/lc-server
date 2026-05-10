import { z } from "zod";

export const updateSchema = z.object({
  body: z
    .object({
      defaultHoursPerSession: z.coerce.number().min(0).optional(),
      autoCalculateOnDay: z.coerce.number().int().min(1).max(28).optional(),
      notifyOnCalculated: z.boolean().optional(),
      notifyOnPaid: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
