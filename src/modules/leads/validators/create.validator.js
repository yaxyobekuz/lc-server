import { z } from "zod";

export const createSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, "Ism kerak").max(60),
    lastName: z.string().max(60).optional(),
    phone: z.string().min(5, "Telefon kerak").max(40),
    birthDate: z.coerce.date().nullable().optional(),
    source: z.string().optional(),
    direction: z.string().optional(),
    assignedTo: z.string().optional(),
    requestDate: z.coerce.date().optional(),
    notes: z.string().max(500).optional(),
  }),
});
