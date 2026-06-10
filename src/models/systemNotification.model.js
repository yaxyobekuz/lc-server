import mongoose from "mongoose";

// Tizim bildirishnomalari - global oqim (foydalanuvchiga bog'lanmagan).
// Jami document soni MAX_SYSTEM_NOTIFICATIONS bilan cheklanadi (serviceda).
const systemNotificationSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    // Ixtiyoriy platforma ichi link (mas. "/owner/payments/123")
    link: { type: String, default: null, trim: true },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

systemNotificationSchema.index({ createdAt: -1 });

systemNotificationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const SystemNotification = mongoose.model(
  "SystemNotification",
  systemNotificationSchema,
);

export default SystemNotification;
