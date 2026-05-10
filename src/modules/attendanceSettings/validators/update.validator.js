import { z } from "zod";

export const updateSchema = z.object({
  body: z
    .object({
      lowAttendanceThreshold: z.coerce.number().min(0).max(100).optional(),
      consecutiveAbsencesAlert: z.coerce.number().int().min(1).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
