import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// O'quvchining bir guruh uchun chegirmasi. fixed (UZS summa) yoki percent (0..100).
// scope=permanent → doimiy (barcha oylar); scope=monthly → faqat (year, month) uchun.
const discountSchema = new mongoose.Schema(
  {
    student: {
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
    type: { type: String, enum: ["fixed", "percent"], required: true },
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

discountSchema.index({ student: 1, group: 1, scope: 1, year: 1, month: 1 });

discountSchema.pre("validate", function (next) {
  if (this.type === "percent" && this.value > 100) {
    return next(new Error("Foiz 100 dan oshmasligi kerak"));
  }
  if (this.scope === "monthly" && (!this.year || !this.month)) {
    return next(new Error("Oylik chegirma uchun yil va oy kerak"));
  }
  next();
});

discountSchema.plugin(softDeletePlugin);

const Discount = mongoose.model("Discount", discountSchema);

export default Discount;
