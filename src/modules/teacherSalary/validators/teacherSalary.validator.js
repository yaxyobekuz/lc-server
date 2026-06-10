import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    groupId: z.string().optional(),
    teacherId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    status: z.enum(["unpaid", "partial", "paid"]).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(300).default(200),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const upsertSchema = z.object({
  body: z.object({
    teacher: z.string({ required_error: "O'qituvchi kerak" }).min(1),
    group: z.string({ required_error: "Guruh kerak" }).min(1),
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
    salaryType: z.enum(["fixed", "percent", "mixed"]),
    fixedAmount: z.coerce.number().int().min(0).default(0),
    percentRate: z.coerce.number().min(0).max(100).default(0),
    workStartDate: z.string().nullable().optional(),
  }),
});

export const regenerateSchema = z.object({
  body: z.object({
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
  }),
});

export const obligationsSchema = z.object({
  query: z.object({
    groupId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
  }),
});
