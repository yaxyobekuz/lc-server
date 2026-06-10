import { z } from "zod";

// Davomat sana inputi - timezone-xavfsiz.
// "YYYY-MM-DD" string AFZAL (aniq kalendar kuni, zona aralashmaydi).
// Orqaga-moslik uchun ISO instant ham qabul qilinadi; servisdagi parseLocalDay
// uni mahalliy (Asia/Tashkent) kalendar kuniga keltiradi.
// String holatini saqlaymiz - servis o'zi mahalliy kunga aylantiradi.
export const dateInputSchema = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak"),
    z.coerce.date(),
  ])
  .transform((v) => (v instanceof Date ? v.toISOString() : v));

// Davomat YOZISH uchun qat'iy sana - FAQAT "YYYY-MM-DD".
// ISO instant qabul qilinmaydi: aks holda kechki dars (masalan 20:30Z)
// parseLocalDay'da +5 soat bilan keyingi kunga siljib, davomat noto'g'ri
// kunga yozilardi (A-2 timezone bug). Yozuvda kalendar kuni aniq bo'lishi shart.
export const recordDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak");

// Sessiya (slot): "" yoki "HH:mm"
export const slotSchema = z
  .string()
  .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Sessiya formati noto'g'ri (HH:mm)")
  .max(5);
