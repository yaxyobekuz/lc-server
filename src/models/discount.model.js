import mongoose from "mongoose";

export const DISCOUNT_VALUE_TYPES = ["percent", "amount"];

const discountSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    kind: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscountKind",
      required: true,
    },
    valueType: {
      type: String,
      enum: DISCOUNT_VALUE_TYPES,
      required: true,
    },
    value: { type: Number, required: true, min: 0 },
    reason: { type: String, default: "" },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

discountSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Discount = mongoose.model("Discount", discountSchema);

export default Discount;
