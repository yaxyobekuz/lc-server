import { z } from "zod";

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      name: z.string().min(1).max(120).optional(),
      isRecurring: z.boolean().optional(),
      month: z.coerce.number().int().min(1).max(12).optional(),
      day: z.coerce.number().int().min(1).max(31).optional(),
      year: z.coerce.number().int().min(2000).max(2100).nullable().optional(),
      message: z.string().min(1).max(2000).optional(),
      audience: z.enum(["all", "students", "teachers"]).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
