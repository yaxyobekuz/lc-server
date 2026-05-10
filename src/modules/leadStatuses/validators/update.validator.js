import { z } from "zod";

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      name: z.string().min(1).max(80).optional(),
      color: z
        .string()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "HEX format")
        .optional(),
      order: z.coerce.number().int().min(0).optional(),
      isInitial: z.boolean().optional(),
      isFinal: z.boolean().optional(),
      isConverted: z.boolean().optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
