import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    login: z.string().min(2, "Login juda qisqa"),
    password: z.string().min(6, "Parol kamida 6 belgi bo'lishi kerak"),
  }),
});
