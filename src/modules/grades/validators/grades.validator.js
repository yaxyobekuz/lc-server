import { z } from "zod";

// Davomat validatorlari bilan bir xil ta'rif (timezone-xavfsiz).
const dateInputSchema = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak"),
    z.coerce.date(),
  ])
  .transform((v) => (v instanceof Date ? v.toISOString() : v));

const recordDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak");

const slotSchema = z
  .string()
  .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Sessiya formati noto'g'ri (HH:mm)")
  .max(5);

const itemSchema = z.object({
  studentId: z.string().min(1),
  value: z.coerce.number().int().min(1, "Ball 1 dan kam bo'lmasin").max(5, "Ball 5 dan oshmasin"),
  comment: z.string().max(300).optional(),
});

export const bulkRecordSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  body: z.object({
    date: recordDateSchema,
    slot: slotSchema.optional(),
    items: z.array(itemSchema).min(1, "Hech bo'lmaganda bitta ball kerak"),
  }),
});

export const listForDateSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    date: dateInputSchema,
    slot: slotSchema.optional(),
  }),
});

export const groupRangeSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    fromDate: dateInputSchema,
    toDate: dateInputSchema,
  }),
});

export const studentRangeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    fromDate: dateInputSchema.optional(),
    toDate: dateInputSchema.optional(),
  }),
});

export const leaderboardSchema = z.object({
  query: z.object({
    scope: z.string().optional(), // "all" yoki groupId
    fromDate: dateInputSchema.optional(),
    toDate: dateInputSchema.optional(),
    limit: z.coerce.number().int().positive().max(1000).optional(),
  }),
});

export const ratingSettingsUpdateSchema = z.object({
  body: z.object({
    gradeWeight: z.coerce.number().min(0).max(1).optional(),
    attendanceWeight: z.coerce.number().min(0).max(1).optional(),
  }),
});
