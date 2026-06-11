import { z } from "zod";
import {
  dateInputSchema,
  recordDateSchema,
} from "../../attendance/validators/shared.js";

// Student davomati bilan bir xil sana qoidalari (A-2 timezone bug parity):
// o'qish - moslashuvchan; YOZISH - faqat "YYYY-MM-DD" (ISO instant +5 soat
// siljib absence'ni noto'g'ri kunga yozardi).
export const listForDateSchema = z.object({
  query: z.object({ date: dateInputSchema }),
});

const itemSchema = z.object({
  teacherId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "O'qituvchi identifikatori noto'g'ri"),
  status: z.enum(["present", "absent", "excused"]),
  reason: z.string().max(300).optional(),
});

export const bulkRecordSchema = z.object({
  body: z.object({
    date: recordDateSchema,
    items: z.array(itemSchema).min(1, "Hech bo'lmaganda bitta yozuv kerak"),
  }),
});
