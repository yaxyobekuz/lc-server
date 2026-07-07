import { z } from "zod";
import { idParam, idStudentParams, idMembershipParams } from "./common.js";

export const idParamSchema = z.object({ params: idParam });

// Guruhni butunlay o'chirish: tasdiq uchun guruh nomi body'da yuboriladi.
export const permanentDeleteSchema = z.object({
  params: idParam,
  body: z.object({ confirmName: z.string().optional() }).default({}),
});
export const studentParamsSchema = z.object({
  params: idStudentParams,
  // Guruhdan chiqarishda ixtiyoriy dinamik sabab (ArchiveReason id).
  body: z
    .object({
      reasonId: z.string().min(1).optional(),
    })
    .optional(),
});

// O'qish davrlari (membership): ro'yxat + id bo'yicha tahrir/o'chir.
export const membershipListSchema = z.object({ params: idStudentParams });
export const membershipByIdSchema = z.object({ params: idMembershipParams });
export const membershipUpdateSchema = z.object({
  params: idMembershipParams,
  body: z
    .object({
      joinedAt: z.coerce.date().optional(),
      leftAt: z.coerce.date().nullable().optional(),
    })
    .refine((b) => b.joinedAt !== undefined || b.leftAt !== undefined, {
      message: "O'zgartirish uchun sana kiritilmagan",
    }),
});

export const historyQuerySchema = z.object({
  params: idParam,
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
