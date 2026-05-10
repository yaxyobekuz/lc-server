import mongoose from "mongoose";

const discountKindSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

discountKindSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

discountKindSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const DiscountKind = mongoose.model("DiscountKind", discountKindSchema);

export default DiscountKind;
