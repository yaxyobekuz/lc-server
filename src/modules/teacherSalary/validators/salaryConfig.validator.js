import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    groupId: z.string().optional(),
    teacherId: z.string().optional(),
    search: z.string().trim().optional(),
  }),
});

export const upsertSchema = z.object({
  body: z.object({
    teacher: z.string({ required_error: "O'qituvchi kerak" }).min(1),
    group: z.string({ required_error: "Guruh kerak" }).min(1),
    salaryType: z.enum(["fixed", "percent", "mixed"]),
    fixedAmount: z.coerce.number().int().min(0).default(0),
    percentRate: z.coerce.number().min(0).max(100).default(0),
  }),
});

export const pairParamSchema = z.object({
  params: z.object({
    teacher: z.string().min(1),
    group: z.string().min(1),
  }),
});
