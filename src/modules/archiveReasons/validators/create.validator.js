import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Sarlavha kerak").max(120),
  }),
});
