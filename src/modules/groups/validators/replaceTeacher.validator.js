import { z } from "zod";

// Guruhda o'qituvchini boshqasiga almashtirish + yangi stavka
export const replaceTeacherSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    oldTeacherId: z.string().min(1, "Eski o'qituvchi kerak"),
    newTeacherId: z.string().min(1, "Yangi o'qituvchi kerak"),
    // Almashish sanasi — shu sanagacha eski, keyin yangi o'qituvchi hisoblanadi
    date: z.coerce.date().optional(),
    rate: z.object({
      calculationType: z.enum([
        "fixed",
        "hourly",
        "percentage",
        "per_student",
        "mixed",
      ]),
      fixedAmount: z.coerce.number().min(0).optional(),
      hourlyRate: z.coerce.number().min(0).optional(),
      hoursPerSession: z.coerce.number().min(0).optional(),
      percentageRate: z.coerce.number().min(0).max(100).optional(),
      amountPerStudent: z.coerce.number().min(0).optional(),
      minMonthlyAmount: z.coerce.number().min(0).optional(),
    }),
  }),
});
