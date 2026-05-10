import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    student: z.string().min(1, "Talaba kerak"),
    kind: z.string().min(1, "Chegirma turi kerak"),
    valueType: z.enum(["percent", "amount"]),
    value: z.coerce.number().min(0),
    reason: z.string().max(200).optional(),
    startDate: z.union([z.coerce.date(), z.null()]).optional(),
    endDate: z.union([z.coerce.date(), z.null()]).optional(),
    isActive: z.boolean().optional(),
  }),
});
