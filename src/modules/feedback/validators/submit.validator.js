import { z } from "zod";

export const submitSchema = z.object({
  body: z.object({
    type: z.string().min(1, "Tur kerak"),
    group: z.string().nullable().optional(),
    message: z
      .string()
      .min(5, "Matn kamida 5 belgidan iborat bo'lishi kerak")
      .max(2000),
    isAnonymous: z.boolean().optional(),
  }),
});
