import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    login: z.string().min(3, "Login kamida 3 belgidan iborat"),
    password: z.string().min(4, "Parol kamida 4 belgidan iborat"),
    initData: z.string().min(10, "initData kerak"),
  }),
});
