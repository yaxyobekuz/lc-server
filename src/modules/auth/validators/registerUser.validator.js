import { z } from "zod";
import { ROLES } from "../../../constants/roles.js";

const STUDENT_FIELDS = ["enrolledAt"];
const TEACHER_FIELDS = ["hiredAt"];

export const registerUserSchema = z.object({
  body: z
    .object({
      firstName: z.string().min(1, "Ism kerak").max(60),
      lastName: z.string().min(1, "Familiya kerak").max(60),
      username: z.string().min(3, "Username kamida 3 belgidan iborat").max(40),
      phone: z.string().min(9, "Telefon noto'g'ri").optional(),
      password: z.string().min(6, "Parol kamida 6 belgidan iborat"),
      role: z.enum([ROLES.TEACHER, ROLES.STUDENT]),

      birthDate: z.union([z.coerce.date(), z.null()]).optional(),
      gender: z.enum(["male", "female"]).nullable().optional(),

      // Student-only
      enrolledAt: z.union([z.coerce.date(), z.null()]).optional(),

      // Teacher-only
      hiredAt: z.union([z.coerce.date(), z.null()]).optional(),
    })
    .superRefine((b, ctx) => {
      if (b.role === ROLES.TEACHER) {
        for (const f of STUDENT_FIELDS) {
          if (b[f] !== undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [f],
              message: `Bu maydon (${f}) faqat o'quvchi uchun`,
            });
          }
        }
      }
      if (b.role === ROLES.STUDENT) {
        for (const f of TEACHER_FIELDS) {
          if (b[f] !== undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [f],
              message: `Bu maydon (${f}) faqat o'qituvchi uchun`,
            });
          }
        }
      }
    }),
});
