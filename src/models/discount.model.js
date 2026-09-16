import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";
import { DISCOUNT_SCOPES } from "../constants/discountScopes.js";

// O'quvchining bir guruh uchun chegirmasi. fixed (UZS summa) yoki percent (0..100).
// year/month - boshlanish (yoki yagona) oy, endYear/endMonth - faqat range tugash oyi.
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
    scope: { type: String, enum: DISCOUNT_SCOPES, required: true },
    year: { type: Number, default: null },
    month: { type: Number, default: null, min: 1, max: 12 },
    endYear: { type: Number, default: null },
    endMonth: { type: Number, default: null, min: 1, max: 12 },
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
  if (this.scope !== "permanent" && (!this.year || !this.month)) {
    return next(new Error("Chegirma uchun yil va oy kerak"));
  }
  if (this.scope === "range" && (!this.endYear || !this.endMonth)) {
    return next(new Error("Oylar oralig'i uchun tugash oyi kerak"));
  }
  next();
});

discountSchema.plugin(softDeletePlugin);

const Discount = mongoose.model("Discount", discountSchema);

export default Discount;
