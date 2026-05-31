import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    student: z.string().min(1, "O'quvchi kerak"),
    group: z.union([z.string().min(1), z.null()]).optional(),
    kind: z.string().min(1, "Chegirma turi kerak"),
    valueType: z.enum(["percent", "amount"]),
    value: z.coerce.number().min(0),
    reason: z.string().max(200).optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});
