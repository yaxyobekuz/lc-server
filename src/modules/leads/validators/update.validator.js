import { z } from "zod";

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      firstName: z.string().min(1).max(60).optional(),
      lastName: z.string().max(60).optional(),
      phone: z.string().min(5).max(40).optional(),
      birthDate: z.coerce.date().nullable().optional(),
      source: z.string().nullable().optional(),
      direction: z.string().nullable().optional(),
      assignedTo: z.string().nullable().optional(),
      notes: z.string().max(500).optional(),
      rejectionReason: z
        .enum(["price", "time", "other_center", "other"])
        .nullable()
        .optional(),
      rejectionNote: z.string().max(300).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
