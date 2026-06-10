import mongoose from "mongoose";

const notificationRecipientSchema = new mongoose.Schema(
  {
    notification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Platforma ichidagi inbox'da ko'rinsinmi (notification.channels.inapp dan
    // denormalizatsiya). false bo'lsa - faqat Telegram orqali yetkaziladi.
    inapp: { type: Boolean, default: true },
    readAt: { type: Date, default: null },
    botDeliveredAt: { type: Date, default: null },
    botFailedReason: { type: String, default: "" },
  },
  { timestamps: true },
);

// Bir foydalanuvchi bir notification uchun faqat bitta record
notificationRecipientSchema.index(
  { notification: 1, user: 1 },
  { unique: true },
);
notificationRecipientSchema.index({ user: 1, readAt: 1, createdAt: -1 });

notificationRecipientSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const NotificationRecipient = mongoose.model(
  "NotificationRecipient",
  notificationRecipientSchema,
);

export default NotificationRecipient;
