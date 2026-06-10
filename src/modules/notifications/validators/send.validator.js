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

const AUDIENCE_TYPES = [
  "all_students",
  "all_teachers",
  "groups",
  "users",
  "individual",
];

const audienceShape = z.object({
  type: z.enum(AUDIENCE_TYPES),
  groupIds: z.array(z.string()).optional(),
  userIds: z.array(z.string()).optional(),
});

export const sendSchema = z.object({
  body: z.object({
    title: z.string().max(200).optional(),
    body: z.string().max(2000).optional(),
    category: z.enum(CATEGORIES).optional(),
    templateId: z.string().optional(),
    // Yetkazish kanallari - kamida bittasi. Berilmasa eski xulq: ikkalasi.
    channels: z
      .array(z.enum(["inapp", "telegram"]))
      .min(1, "Kamida bitta kanal tanlang")
      .optional(),
    // Kelajakdagi vaqtga rejalashtirish (ISO sana). Berilmasa - darhol.
    scheduleAt: z.coerce.date().optional(),
    audience: audienceShape,
  }),
});

// Recipient sonini oldindan hisoblash uchun (jonli preview).
export const previewSchema = z.object({
  body: z.object({
    audience: audienceShape,
  }),
});
