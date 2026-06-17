import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
    search: z.string().trim().optional(),
  }),
});

export const byGroupSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
});

export const upsertSchema = z.object({
  body: z.object({
    groupId: z.string({ required_error: "Guruh kerak" }).min(1),
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
    amount: z.coerce.number().int().min(0, "Manfiy bo'lmasligi kerak"),
  }),
});
