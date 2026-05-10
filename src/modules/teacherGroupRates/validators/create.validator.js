import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    teacher: z.string().min(1, "O'qituvchi kerak"),
    group: z.string().min(1, "Guruh kerak"),
    calculationType: z.enum(["fixed", "hourly", "percentage", "mixed"]),
    fixedAmount: z.coerce.number().min(0).optional(),
    hourlyRate: z.coerce.number().min(0).optional(),
    hoursPerSession: z.coerce.number().min(0).optional(),
    percentageRate: z.coerce.number().min(0).max(100).optional(),
    minMonthlyAmount: z.coerce.number().min(0).optional(),
    effectiveFrom: z.coerce.date().optional(),
    notes: z.string().max(300).optional(),
  }),
});
