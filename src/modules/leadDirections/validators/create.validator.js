import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Nom kerak").max(80),
  }),
});
