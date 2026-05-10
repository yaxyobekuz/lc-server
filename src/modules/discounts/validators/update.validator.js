import { z } from "zod";

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      kind: z.string().min(1).optional(),
      valueType: z.enum(["percent", "amount"]).optional(),
      value: z.coerce.number().min(0).optional(),
      reason: z.string().max(200).optional(),
      startDate: z.union([z.coerce.date(), z.null()]).optional(),
      endDate: z.union([z.coerce.date(), z.null()]).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
