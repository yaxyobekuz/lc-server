import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    student: z.string().min(1, "O'quvchi kerak"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    reason: z.string().max(300).optional(),
    isActive: z.boolean().optional(),
  }),
});
