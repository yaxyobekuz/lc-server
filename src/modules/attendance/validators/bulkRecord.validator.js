import { z } from "zod";

const itemSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["present", "absent", "excused", "exempt"]),
  reason: z.string().max(300).optional(),
  lateMinutes: z.coerce.number().int().min(0).optional(),
});

export const bulkRecordSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  body: z.object({
    date: z.coerce.date(),
    slot: z.string().max(5).optional(), // sessiya: "" yoki "HH:mm"
    items: z.array(itemSchema).min(1, "Hech bo'lmaganda bitta yozuv kerak"),
  }),
});
