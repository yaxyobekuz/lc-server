import { z } from "zod";
import { scheduleArray } from "./common.js";

export const createSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: "Guruh nomini kiriting" })
      .min(2, "Kamida 2 belgidan iborat bo'lishi kerak")
      .max(120, "120 belgidan oshmasligi kerak"),
    schedule: scheduleArray.default([]),
    // Guruhda ko'pi bilan bitta o'qituvchi (keyinchalik faqat "Almashtirish")
    teachers: z
      .array(z.string().min(1))
      .max(1, "Guruhda faqat bitta o'qituvchi bo'lishi mumkin")
      .default([]),
    startDate: z.coerce.date().nullable().optional(),
    // Kurs tugash sanasi - belgilansa shu kun bo'yicha kurs avtomatik tugaydi.
    endDate: z.coerce.date().nullable().optional(),
    durationMonths: z.coerce.number().min(0).nullable().optional(),
    // Joriy oy uchun guruh oylik to'lovi (ixtiyoriy). Berilsa - GroupFee shu
    // summa bilan yaratiladi; berilmasa 0 (keyin Moliyadan belgilanadi).
    monthlyPrice: z.coerce.number().int().min(0).nullable().optional(),
  }),
});
