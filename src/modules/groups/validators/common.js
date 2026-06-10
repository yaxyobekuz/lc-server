import { z } from "zod";
import { GROUP_DAYS } from "../../../models/group.model.js";

export const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const scheduleItem = z
  .object({
    day: z.enum(GROUP_DAYS),
    startTime: z.string().regex(TIME_RX, "Vaqt formati HH:mm"),
    endTime: z.string().regex(TIME_RX, "Vaqt formati HH:mm"),
  })
  .refine((s) => s.startTime < s.endTime, {
    message: "Tugash vaqti boshlanishidan keyin bo'lishi kerak",
    path: ["endTime"],
  });

// Jadvalda bir kun faqat bir marta - duplikat day'larni rad qiladi
export const scheduleArray = z
  .array(scheduleItem)
  .superRefine((arr, ctx) => {
    const seen = new Map();
    arr.forEach((item, idx) => {
      if (seen.has(item.day)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bu kun jadvalda allaqachon mavjud",
          path: [idx, "day"],
        });
      } else {
        seen.set(item.day, idx);
      }
    });
  });

export const idParam = z.object({ id: z.string().min(1) });
export const idStudentParams = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
});
