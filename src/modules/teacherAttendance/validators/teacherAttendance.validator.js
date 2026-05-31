import { z } from "zod";

export const listForDateSchema = z.object({
  query: z.object({ date: z.coerce.date() }),
});

const itemSchema = z.object({
  teacherId: z.string().min(1),
  status: z.enum(["present", "absent", "excused"]),
  reason: z.string().max(300).optional(),
});

export const bulkRecordSchema = z.object({
  body: z.object({
    date: z.coerce.date(),
    items: z.array(itemSchema).min(1, "Hech bo'lmaganda bitta yozuv kerak"),
  }),
});
