import mongoose from "mongoose";
import defaultFlagPlugin from "./plugins/defaultFlag.plugin.js";

const paymentMethodSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    code: { type: String, trim: true, lowercase: true, default: "" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

paymentMethodSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
paymentMethodSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true, code: { $type: "string", $ne: "" } },
  },
);

paymentMethodSchema.plugin(defaultFlagPlugin);

paymentMethodSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const PaymentMethod = mongoose.model("PaymentMethod", paymentMethodSchema);

export default PaymentMethod;
