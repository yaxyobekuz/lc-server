import { z } from "zod";
import { RISK_LEVELS } from "../services/debt.service.js";

export const debtorsListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    groupId: z.string().optional(),
    risk: z.enum(RISK_LEVELS).optional(),
    // Arxivlangan o'quvchilar: "all" - hammasi (asosiy holat, chunki aynan
    // arxivlanganlar qarzini to'lamay ketganlar), "active"/"archived" - ajratib.
    archived: z.enum(["all", "active", "archived"]).default("all"),
    // "active" - undiriladigan qarz, "written_off" - hisobdan chiqarilganlar.
    view: z.enum(["active", "written_off"]).default("active"),
    sort: z.enum(["risk", "debt", "oldest", "name"]).default("risk"),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(25),
  }),
});

export const studentIdParamSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
});

export const writeOffSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
  body: z.object({
    reason: z.string().trim().max(300).optional(),
  }),
});

export const settingsUpdateSchema = z.object({
  body: z
    .object({
      graceDays: z.coerce.number().int().min(0).max(31).optional(),
      mediumMonths: z.coerce.number().int().min(1).max(12).optional(),
      highMonths: z.coerce.number().int().min(1).max(12).optional(),
      inactivityDays: z.coerce.number().int().min(1).max(365).optional(),
      // z.coerce.boolean() "false" satrini ham true qilib yuboradi - shuning
      // uchun boolean yoki aniq "true"/"false" satri qabul qilinadi.
      archiveDebtLock: z
        .union([z.boolean(), z.enum(["true", "false"])])
        .transform((v) => v === true || v === "true")
        .optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
