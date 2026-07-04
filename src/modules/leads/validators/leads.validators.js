import { z } from "zod";
import { LEAD_STATUSES } from "../../../constants/leadStatus.js";

const statusEnum = z.enum(LEAD_STATUSES);

export const listSchema = z.object({
  query: z.object({
    status: statusEnum.optional(),
    source: z.string().optional(),
    direction: z.string().optional(),
    search: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const statsSchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

const leadFields = {
  firstName: z.string().min(1).max(60),
  lastName: z.string().max(60).optional(),
  age: z.coerce.number().int().min(1).max(120).nullable().optional(),
  phone: z.string().min(9, "Telefon kerak"),
  parentPhone: z.string().nullable().optional(),
  sourceId: z.string().nullable().optional(),
  directionId: z.string().nullable().optional(),
  rejectionReasonId: z.string().nullable().optional(),
  status: statusEnum.optional(),
  trialDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).optional(),
};

export const createSchema = z.object({
  body: z.object(leadFields),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      ...leadFields,
      firstName: z.string().min(1).max(60).optional(),
      phone: z.string().min(9).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

export const reminderSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    followUpAt: z.coerce.date().nullable().optional(),
    followUpNote: z.string().max(500).optional(),
  }),
});

export const convertSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    firstName: z.string().min(1, "Ism kerak").max(60),
    lastName: z.string().min(1, "Familiya kerak").max(60),
    username: z.string().min(3, "Username kamida 3 belgidan iborat").max(40),
    phone: z.string().min(9, "Telefon kerak"),
    password: z.string().min(6, "Parol kamida 6 belgidan iborat"),
    gender: z.enum(["male", "female"]).nullable().optional(),
    enrolledAt: z.coerce.date().nullable().optional(),
  }),
});
