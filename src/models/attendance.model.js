import mongoose from "mongoose";

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "excused",
  "late",
  "exempt",
];
export const ATTENDANCE_SOURCES = ["teacher", "admin", "auto-exempt"];

const attendanceSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: { type: Date, required: true },
    dateKey: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak"],
    },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      required: true,
    },
    reason: { type: String, default: "" },
    lateMinutes: { type: Number, default: 0, min: 0 },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recordedAt: { type: Date, default: Date.now },
    source: {
      type: String,
      enum: ATTENDANCE_SOURCES,
      default: "teacher",
    },
  },
  { timestamps: true },
);

// Bir (group, student, dateKey) uchun faqat bitta yozuv
attendanceSchema.index(
  { group: 1, student: 1, dateKey: 1 },
  { unique: true },
);
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ group: 1, date: 1 });

attendanceSchema.pre("validate", function (next) {
  if (this.status === "late" && (!this.lateMinutes || this.lateMinutes <= 0)) {
    return next(new Error("Kechikkanlar uchun minutlar majburiy"));
  }
  if (this.status === "excused" && !String(this.reason || "").trim()) {
    return next(new Error("Sababli kelmaslik uchun sabab majburiy"));
  }
  next();
});

attendanceSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
