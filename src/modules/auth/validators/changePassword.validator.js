import { z } from "zod";

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, "Joriy parol kerak"),
      newPassword: z.string().min(6, "Yangi parol kamida 6 belgidan iborat"),
    })
    .refine((b) => b.currentPassword !== b.newPassword, {
      path: ["newPassword"],
      message: "Yangi parol joriy paroldan farq qilishi kerak",
    }),
});
