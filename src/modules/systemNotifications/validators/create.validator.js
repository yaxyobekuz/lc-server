import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    message: z.string().min(1, "Bildirishnoma matni kerak").max(1000),
    link: z.string().max(500).nullable().optional(),
  }),
});
