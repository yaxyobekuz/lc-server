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

export const idParam = z.object({ id: z.string().min(1) });
export const idStudentParams = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
});
