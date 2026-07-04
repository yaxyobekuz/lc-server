import { z } from "zod";

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      firstName: z.string().min(1).max(60).optional(),
      lastName: z.string().min(1).max(60).optional(),
      // Telefon ixtiyoriy: bo'sh string ("") "kiritilmagan" deb qabul qilinadi.
      phone: z.preprocess(
        (v) => (v === "" || v == null ? undefined : v),
        z.string().min(9, "Telefon noto'g'ri").optional(),
      ),
      isActive: z.boolean().optional(),

      birthDate: z.coerce.date().nullable().optional(),
      gender: z.enum(["male", "female"]).nullable().optional(),

      // Student-only
      enrolledAt: z.coerce.date().nullable().optional(),
      // Student-only: o'qishni yakunlagan sana (qo'lda override). null = avtoga qaytarish.
      completedAt: z.coerce.date().nullable().optional(),

      // Teacher-only
      hiredAt: z.coerce.date().nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

// Butunlay o'chirish: o'quvchi uchun to'liq ismni tasdiq sifatida yuboriladi.
export const permanentDeleteSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      confirmName: z.string().optional(),
    })
    .default({}),
});
