import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

export const TEACHER_ATTENDANCE_STATUSES = ["present", "absent", "excused"];

// Hodim (o'qituvchi) kunlik davomati. Yozuv bo'lmasa - default "keldi".
const teacherAttendanceSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: { type: Date, required: true },
    dateKey: { type: String, required: true }, // "YYYY-MM-DD"
    status: {
      type: String,
      enum: TEACHER_ATTENDANCE_STATUSES,
      required: true,
    },
    reason: { type: String, default: "" },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Bir o'qituvchi-kun uchun bitta yozuv
teacherAttendanceSchema.index({ teacher: 1, dateKey: 1 }, { unique: true });
teacherAttendanceSchema.index({ dateKey: 1 });

teacherAttendanceSchema.plugin(softDeletePlugin);

const TeacherAttendance = mongoose.model(
  "TeacherAttendance",
  teacherAttendanceSchema,
);

export default TeacherAttendance;
