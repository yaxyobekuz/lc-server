import { z } from "zod";
import { GROUP_DAYS } from "../../../models/group.model.js";

export const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const scheduleItem = z
  .object({
    day: z.enum(GROUP_DAYS),
    startTime: z.string().regex(TIME_RX, "Vaqt formati HH:mm"),
    endTime: z.string().regex(TIME_RX, "Vaqt formati HH:mm"),
    // Versiyalash: shu slot qaysi sanadan amal qiladi. null/yo'q → boshidan.
    effectiveFrom: z.coerce.date().nullish(),
  })
  .refine((s) => s.startTime < s.endTime, {
    message: "Tugash vaqti boshlanishidan keyin bo'lishi kerak",
    path: ["endTime"],
  });

// Versiyalash tufayli bir kun bir nechta versiyada (turli effectiveFrom bilan)
// bo'lishi mumkin. Faqat AYNAN bir xil (kun + boshlanish vaqti + effectiveFrom)
// takrorlanishini rad qilamiz.
const effKeyOf = (item) =>
  item.effectiveFrom ? new Date(item.effectiveFrom).getTime() : "null";

export const scheduleArray = z
  .array(scheduleItem)
  .superRefine((arr, ctx) => {
    const seen = new Map();
    arr.forEach((item, idx) => {
      const key = `${item.day}-${item.startTime}-${effKeyOf(item)}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bu dars vaqti jadvalda allaqachon mavjud",
          path: [idx, "startTime"],
        });
      } else {
        seen.set(key, idx);
      }
    });
  });

export const idParam = z.object({ id: z.string().min(1) });
export const idStudentParams = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
});
export const idMembershipParams = z.object({
  id: z.string().min(1),
  membershipId: z.string().min(1),
});
