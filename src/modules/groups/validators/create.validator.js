import { z } from "zod";
import { scheduleArray } from "./common.js";

export const createSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Nom kamida 2 belgidan iborat").max(120),
    schedule: scheduleArray.default([]),
    teachers: z.array(z.string().min(1)).default([]),
    monthlyPrice: z.coerce.number().min(0).default(0),
    direction: z.string().min(1).nullable().optional(),
  }),
});
