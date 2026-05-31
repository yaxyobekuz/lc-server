import { z } from "zod";

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      type: z.string().min(1).optional(),
      amount: z.coerce.number().min(0).optional(),
      date: z.coerce.date().optional(),
      description: z.string().max(500).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
