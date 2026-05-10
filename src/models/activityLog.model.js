import mongoose from "mongoose";

export const HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];
export const ACTOR_ROLES = ["owner", "teacher", "student", "system"];

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    userRole: {
      type: String,
      enum: ACTOR_ROLES,
      default: "system",
    },
    method: { type: String, enum: HTTP_METHODS, required: true },
    path: { type: String, required: true },
    status: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    body: { type: mongoose.Schema.Types.Mixed, default: null },
    resourceType: { type: String, default: "" },
    resourceId: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ resourceType: 1, createdAt: -1 });
activityLogSchema.index({ method: 1, createdAt: -1 });

activityLogSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;
