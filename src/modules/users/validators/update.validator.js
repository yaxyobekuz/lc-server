import { z } from "zod";

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      firstName: z.string().min(1).max(60).optional(),
      lastName: z.string().min(1).max(60).optional(),
      phone: z.string().min(9).optional(),
      isActive: z.boolean().optional(),
      leaveStatus: z
        .union([z.enum(["left_unpaid", "left_paid"]), z.null()])
        .optional(),

      birthDate: z.union([z.coerce.date(), z.null()]).optional(),
      gender: z.enum(["male", "female"]).nullable().optional(),

      // Student-only
      enrolledAt: z.union([z.coerce.date(), z.null()]).optional(),

      // Teacher-only
      hiredAt: z.union([z.coerce.date(), z.null()]).optional(),
      teacherAbsenceMode: z
        .enum(["inherit", "auto", "fixed", "none"])
        .optional(),
      teacherAbsenceAmount: z.coerce.number().min(0).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});
