import { z } from "zod";

const CATEGORIES = [
  "payment_reminder",
  "debt_warning",
  "class_cancel",
  "announcement",
  "admin_personal",
  "teacher_message",
  "feedback_status",
  "holiday",
  "template_based",
  "other",
];

export const listSchema = z.object({
  query: z.object({
    senderId: z.string().optional(),
    category: z.enum(CATEGORIES).optional(),
    channel: z.enum(["inapp", "telegram"]).optional(),
    status: z.enum(["sent", "scheduled", "canceled"]).optional(),
    search: z.string().optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
