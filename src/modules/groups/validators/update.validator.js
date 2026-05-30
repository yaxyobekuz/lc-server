import { z } from "zod";
import { scheduleArray, idParam } from "./common.js";

export const updateSchema = z.object({
  params: idParam,
  body: z
    .object({
      name: z
        .string()
        .min(2, "Kamida 2 belgidan iborat bo'lishi kerak")
        .max(120, "120 belgidan oshmasligi kerak")
        .optional(),
      schedule: scheduleArray.optional(),
      teachers: z.array(z.string().min(1)).optional(),
      monthlyPrice: z.coerce
        .number({ invalid_type_error: "Raqam bo'lishi kerak" })
        .min(0, "0 dan kichik bo'lmasin")
        .optional(),
      direction: z.string().min(1).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
