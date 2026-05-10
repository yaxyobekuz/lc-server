import { z } from "zod";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const createSchema = z.object({
  body: z.object({
    student: z.string().min(1, "Talaba kerak"),
    startDate: z.coerce.date(),
    endDate: z.union([z.coerce.date(), z.null()]).optional(),
    daysOfWeek: z.array(z.enum(DAYS)).optional(),
    reason: z.string().max(300).optional(),
    isActive: z.boolean().optional(),
  }),
});
