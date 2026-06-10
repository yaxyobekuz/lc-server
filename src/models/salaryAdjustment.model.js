import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// O'qituvchi maoshiga bonus yoki jarima. fixed (UZS) yoki percent (maoshdan %).
// scope=permanent → doimiy (barcha oylar); scope=monthly → faqat (year, month).
const salaryAdjustmentSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    kind: { type: String, enum: ["bonus", "fine"], required: true },
    valueType: { type: String, enum: ["fixed", "percent"], required: true },
    value: { type: Number, required: true, min: 0 },
    scope: { type: String, enum: ["permanent", "monthly"], required: true },
    year: { type: Number, default: null },
    month: { type: Number, default: null, min: 1, max: 12 },
    reason: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

salaryAdjustmentSchema.index({ teacher: 1, group: 1, scope: 1, year: 1, month: 1 });

salaryAdjustmentSchema.pre("validate", function (next) {
  if (this.valueType === "percent" && this.value > 100) {
    return next(new Error("Foiz 100 dan oshmasligi kerak"));
  }
  if (this.scope === "monthly" && (!this.year || !this.month)) {
    return next(new Error("Oylik bonus/jarima uchun yil va oy kerak"));
  }
  next();
});

salaryAdjustmentSchema.plugin(softDeletePlugin);

const SalaryAdjustment = mongoose.model("SalaryAdjustment", salaryAdjustmentSchema);

export default SalaryAdjustment;
