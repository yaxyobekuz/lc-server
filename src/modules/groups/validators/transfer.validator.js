import { z } from "zod";
import { idStudentParams } from "./common.js";

export const transferSchema = z.object({
  params: idStudentParams,
  body: z.object({
    targetGroupId: z.string().min(1, "Yangi guruh tanlanmagan"),
    joinedAt: z.coerce.date().optional(),
  }),
});
