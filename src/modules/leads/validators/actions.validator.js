import { z } from "zod";

export const changeStatusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    statusId: z.string().min(1, "Status kerak"),
    message: z.string().max(300).optional(),
  }),
});

export const addNoteSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    message: z.string().min(1, "Eslatma matni kerak").max(500),
  }),
});

export const recordContactSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    message: z.string().max(500).optional(),
  }),
});

export const setFollowUpSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    date: z.coerce.date(),
    note: z.string().max(300).optional(),
  }),
});

export const setTrialSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    date: z.coerce.date(),
    groupId: z.string().min(1, "Guruh kerak"),
  }),
});

export const convertSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    firstName: z.string().min(1).max(60),
    lastName: z.string().min(1).max(60),
    username: z.string().min(3).max(40),
    phone: z.string().min(5),
    password: z.string().min(6),
    birthDate: z.coerce.date().nullable().optional(),
    gender: z.enum(["male", "female"]).nullable().optional(),
    address: z.string().max(200).optional(),
    parentName: z.string().max(120).optional(),
    parentPhone: z.string().optional(),
    enrolledAt: z.coerce.date().nullable().optional(),
  }),
});

export const rangeSchema = z.object({
  query: z.object({
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
  }),
});
