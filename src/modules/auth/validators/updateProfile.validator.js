import { z } from "zod";

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, "Ism kerak").max(60).optional(),
    lastName: z.string().min(1, "Familiya kerak").max(60).optional(),
    phone: z.string().min(9, "Telefon kerak").optional(),
    birthDate: z.union([z.coerce.date(), z.null()]).optional(),
    gender: z.enum(["male", "female"]).nullable().optional(),
  }),
});
