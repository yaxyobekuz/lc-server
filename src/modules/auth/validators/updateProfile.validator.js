import { z } from "zod";

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, "Ism kerak").max(60).optional(),
    lastName: z.string().min(1, "Familiya kerak").max(60).optional(),
    // Telefon ixtiyoriy: bo'sh string ("") "kiritilmagan" deb qabul qilinadi.
    phone: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.string().min(9, "Telefon noto'g'ri").optional(),
    ),
    birthDate: z.coerce.date().nullable().optional(),
    gender: z.enum(["male", "female"]).nullable().optional(),
  }),
});
