import { z } from "zod";

// Arxivlash / qaytarish: ixtiyoriy sabab (reasonId) bilan
export const archiveActionSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      reasonId: z.string().min(1).optional(),
      // Arxivlash sanasi (ixtiyoriy). Berilmasa - bugun.
      archiveDate: z.coerce.date().nullable().optional(),
      // Qarzi bor o'quvchini arxivlashda tasdiqlash (qarz qulfi).
      confirmDebt: z
        .union([z.boolean(), z.enum(["true", "false"])])
        .transform((v) => v === true || v === "true")
        .optional(),
    })
    .default({}),
});
