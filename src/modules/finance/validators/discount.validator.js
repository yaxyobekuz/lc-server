import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    studentId: z.string().optional(),
    groupId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
  }),
});

export const createSchema = z.object({
  body: z.object({
    student: z.string({ required_error: "O'quvchi kerak" }).min(1),
    group: z.string({ required_error: "Guruh kerak" }).min(1),
    type: z.enum(["fixed", "percent"], { required_error: "Chegirma turi kerak" }),
    value: z.coerce.number().min(0, "Manfiy bo'lmasligi kerak"),
    scope: z.enum(["permanent", "monthly"], { required_error: "Amal qilish doirasi kerak" }),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    reason: z.string().trim().max(300).optional(),
  }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    type: z.enum(["fixed", "percent"]).optional(),
    value: z.coerce.number().min(0).optional(),
    scope: z.enum(["permanent", "monthly"]).optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    reason: z.string().trim().max(300).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});
