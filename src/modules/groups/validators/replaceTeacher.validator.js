import { z } from "zod";

// Guruhda o'qituvchini boshqasiga almashtirish
export const replaceTeacherSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    oldTeacherId: z.string().min(1, "Eski o'qituvchi kerak"),
    newTeacherId: z.string().min(1, "Yangi o'qituvchi kerak"),
    date: z.coerce.date().optional(),
  }),
});
