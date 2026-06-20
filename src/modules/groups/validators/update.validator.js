import { z } from "zod";
import { scheduleArray, idParam } from "./common.js";

export const updateSchema = z.object({
  params: idParam,
  body: z
    .object({
      name: z
        .string()
        .min(2, "Kamida 2 belgidan iborat bo'lishi kerak")
        .max(120, "120 belgidan oshmasligi kerak")
        .optional(),
      schedule: scheduleArray.optional(),
      // Versiyalash: yangi jadval qaysi sanadan amal qiladi (jadval o'zgargan
      // bo'lsa). Berilmasa - bugundan. Eski versiya tarix uchun saqlanib qoladi.
      scheduleEffectiveFrom: z.coerce.date().nullish(),
      // Ko'pi bilan bitta o'qituvchi. Tahrirlashda o'qituvchi odatda yuborilmaydi -
      // u "Almashtirish" orqali boshqariladi.
      teachers: z
        .array(z.string().min(1))
        .max(1, "Guruhda faqat bitta o'qituvchi bo'lishi mumkin")
        .optional(),
      startDate: z.coerce.date().nullable().optional(),
      endDate: z.coerce.date().nullable().optional(),
      durationMonths: z.coerce.number().min(0).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
