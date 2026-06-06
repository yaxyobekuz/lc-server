import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

export const EXEMPTION_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const attendanceExemptionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    daysOfWeek: {
      type: [{ type: String, enum: EXEMPTION_DAYS }],
      default: [],
    },
    reason: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

attendanceExemptionSchema.index({ student: 1, isActive: 1, startDate: 1 });

attendanceExemptionSchema.pre("validate", function (next) {
  if (this.endDate && this.startDate > this.endDate) {
    return next(
      new Error("Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak"),
    );
  }
  next();
});

attendanceExemptionSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

attendanceExemptionSchema.plugin(softDeletePlugin);

const AttendanceExemption = mongoose.model(
  "AttendanceExemption",
  attendanceExemptionSchema,
);

export default AttendanceExemption;
