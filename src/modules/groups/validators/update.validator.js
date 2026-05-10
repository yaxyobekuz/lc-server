import { z } from "zod";
import { scheduleItem, idParam } from "./common.js";

export const updateSchema = z.object({
  params: idParam,
  body: z
    .object({
      name: z.string().min(2).max(120).optional(),
      schedule: z.array(scheduleItem).optional(),
      teachers: z.array(z.string().min(1)).optional(),
      monthlyPrice: z.coerce.number().min(0).optional(),
      direction: z.string().min(1).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
