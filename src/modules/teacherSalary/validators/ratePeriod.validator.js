import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    teacher: z.string().min(1),
    group: z.string().min(1),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const createSchema = z.object({
  body: z.object({
    teacher: z.string().min(1),
    group: z.string().min(1),
    salaryType: z.enum(["fixed", "percent", "mixed"]),
    fixedAmount: z.coerce.number().int().min(0).default(0),
    percentRate: z.coerce.number().min(0).max(100).default(0),
    startYear: z.coerce.number().int().min(2000).max(3000),
    startMonth: z.coerce.number().int().min(1).max(12),
    endYear: z.coerce.number().int().min(2000).max(3000).nullable().optional(),
    endMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    salaryType: z.enum(["fixed", "percent", "mixed"]).optional(),
    fixedAmount: z.coerce.number().int().min(0).optional(),
    percentRate: z.coerce.number().min(0).max(100).optional(),
    startYear: z.coerce.number().int().min(2000).max(3000).optional(),
    startMonth: z.coerce.number().int().min(1).max(12).optional(),
    endYear: z.coerce.number().int().min(2000).max(3000).nullable().optional(),
    endMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  }),
});
