import { z } from "zod";
import { idParam, idStudentParams } from "./common.js";

export const idParamSchema = z.object({ params: idParam });
export const studentParamsSchema = z.object({
  params: idStudentParams,
  // Guruhdan chiqarishda ixtiyoriy dinamik sabab (ArchiveReason id).
  body: z
    .object({
      reasonId: z.string().min(1).optional(),
    })
    .optional(),
});

export const historyQuerySchema = z.object({
  params: idParam,
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
