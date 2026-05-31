import { z } from "zod";
import { idParam } from "./common.js";

export const addStudentSchema = z.object({
  params: idParam,
  body: z.object({
    studentId: z.string().min(1, "O'quvchi tanlanmagan"),
  }),
});
