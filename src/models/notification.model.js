import mongoose from "mongoose";

export const NOTIFICATION_CATEGORIES = [
  "payment_reminder",
  "debt_warning",
  "class_cancel",
  "announcement",
  "admin_personal",
  "teacher_message",
  "feedback_status",
  "holiday",
  "attendance",
  "template_based",
  "other",
];

export const AUDIENCE_TYPES = [
  "all_students",
  "all_teachers",
  "groups",
  "users",
  "individual",
  "feedback_author",
  "auto_system",
];

export const SENDER_ROLES = ["owner", "teacher", "system"];

// Yetkazish kanallari: "inapp" - platforma ichidagi inbox, "telegram" - bot DM.
export const NOTIFICATION_CHANNELS = ["inapp", "telegram"];

// Yuborish holati: "sent" - yuborilgan (yoki yetkazilmoqda),
// "scheduled" - kelajakdagi vaqtga rejalashtirilgan,
// "canceled" - rejadan bekor qilingan.
export const NOTIFICATION_STATUSES = ["sent", "scheduled", "canceled"];

const audienceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: AUDIENCE_TYPES, required: true },
    groupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false },
);

const notificationSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    senderRole: {
      type: String,
      enum: SENDER_ROLES,
      default: "system",
    },
    title: { type: String, default: "", trim: true },
    body: { type: String, required: true },
    category: {
      type: String,
      enum: NOTIFICATION_CATEGORIES,
      default: "other",
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NotificationTemplate",
      default: null,
    },
    audience: { type: audienceSchema, required: true },
    // Tanlangan yetkazish kanallari. Bo'sh bo'lsa eski xulq: ikkala kanal.
    channels: {
      type: [{ type: String, enum: NOTIFICATION_CHANNELS }],
      default: () => ["inapp", "telegram"],
    },
    // Yuborish holati va rejalashtirilgan vaqt (darhol yuborilsa - null).
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: "sent",
      index: true,
    },
    scheduleAt: { type: Date, default: null, index: true },
    recipientsCount: { type: Number, default: 0, min: 0 },
    deliveredViaBot: { type: Number, default: 0, min: 0 },
    readCount: { type: Number, default: 0, min: 0 },
    isAuto: { type: Boolean, default: false },
    // Idempotentlik kaliti (avto job/qayta-urinish dublikat yaratmasligi uchun).
    dedupeKey: { type: String, default: null },
    relatedFeedback: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Feedback",
      default: null,
    },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

notificationSchema.index({ sender: 1, sentAt: -1 });
notificationSchema.index({ category: 1, sentAt: -1 });
notificationSchema.index({ sentAt: -1 });
// dedupeKey unique - faqat qiymat bor bo'lganda (partial)
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);

notificationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
