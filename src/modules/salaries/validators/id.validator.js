import { z } from "zod";

export const idSchema = z.object({
  params: z.object({
    id: z.string().min(1, "ID kerak"),
  }),
});

export const adjustmentIdSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    adjId: z.string().min(1),
  }),
});

export const payoutIdSchema = z.object({
  params: z.object({
    payoutId: z.string().min(1),
  }),
});
