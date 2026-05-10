import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Nom kerak").max(80),
    color: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "HEX format")
      .optional(),
    order: z.coerce.number().int().min(0).optional(),
    isInitial: z.boolean().optional(),
    isFinal: z.boolean().optional(),
    isConverted: z.boolean().optional(),
  }),
});
