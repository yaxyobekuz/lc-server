import { z } from "zod";
import { recordDateSchema, slotSchema } from "./shared.js";

const itemSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["present", "absent", "excused", "exempt"]),
  reason: z.string().max(300).optional(),
  // Kechikish daqiqasi - bir kunlik dars uzunligidan oshmasligi kerak (10 soat chek)
  lateMinutes: z.coerce.number().int().min(0).max(600).optional(),
});

export const bulkRecordSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  body: z.object({
    date: recordDateSchema,
    slot: slotSchema.optional(), // sessiya: "" yoki "HH:mm"
    items: z.array(itemSchema).min(1, "Hech bo'lmaganda bitta yozuv kerak"),
  }),
});
