import { z } from "zod";
import { idStudentParams } from "./common.js";

// A'zolik sanalarini tahrirlash: joinedAt (boshlash) va leftAt (tugatgan).
// leftAt: null yuborilsa "o'qimoqda"ga qaytariladi; umuman yuborilmasa o'zgarmaydi.
export const updateMembershipSchema = z.object({
  params: idStudentParams,
  body: z
    .object({
      joinedAt: z.coerce.date().optional(),
      leftAt: z.coerce.date().nullable().optional(),
    })
    .refine((b) => b.joinedAt !== undefined || b.leftAt !== undefined, {
      message: "O'zgartirish uchun sana kiritilmagan",
    }),
});
