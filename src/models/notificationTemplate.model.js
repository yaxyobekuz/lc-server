import mongoose from "mongoose";

export const TEMPLATE_CATEGORIES = [
  "payment",
  "debt",
  "class_cancel",
  "announcement",
  "holiday",
  "personal",
  "feedback_status",
  "custom",
];

const notificationTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    body: { type: String, required: true, minlength: 1 },
    category: {
      type: String,
      enum: TEMPLATE_CATEGORIES,
      default: "custom",
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

notificationTemplateSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

notificationTemplateSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const NotificationTemplate = mongoose.model(
  "NotificationTemplate",
  notificationTemplateSchema,
);

export default NotificationTemplate;
