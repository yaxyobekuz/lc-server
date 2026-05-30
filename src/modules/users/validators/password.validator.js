import { z } from "zod";

export const setPasswordSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    password: z.string().min(6, "Parol kamida 6 belgidan iborat"),
  }),
});
