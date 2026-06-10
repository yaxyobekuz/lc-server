import { z } from "zod";
import { dateInputSchema, recordDateSchema } from "./shared.js";

export const teacherStatusSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({ date: dateInputSchema }),
});

export const teacherSetSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  body: z.object({
    // Yozuv - qat'iy kalendar kuni (A-2 timezone fix)
    date: recordDateSchema,
    present: z.coerce.boolean(),
  }),
});
