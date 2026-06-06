import { z } from "zod";
import { scheduleArray } from "./common.js";

export const createSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: "Guruh nomini kiriting" })
      .min(2, "Kamida 2 belgidan iborat bo'lishi kerak")
      .max(120, "120 belgidan oshmasligi kerak"),
    schedule: scheduleArray.default([]),
    teachers: z.array(z.string().min(1)).default([]),
    monthlyPrice: z.coerce
      .number({ invalid_type_error: "Raqam bo'lishi kerak" })
      .min(0, "0 dan kichik bo'lmasin")
      .default(0),
    direction: z.string().min(1).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    durationMonths: z.coerce.number().min(0).nullable().optional(),
    teacherAbsenceMode: z.enum(["inherit", "auto", "fixed", "none"]).optional(),
    teacherAbsenceAmount: z.coerce.number().min(0).optional(),
  }),
});
