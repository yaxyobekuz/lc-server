import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

export const PAYMENT_TYPES = ["payment", "refund"];

const paymentSchema = new mongoose.Schema(
  {
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: PAYMENT_TYPES, default: "payment" },
    method: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentMethod",
      required: true,
    },
    paidAt: { type: Date, default: Date.now },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    refundOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    refundReason: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

paymentSchema.index({ invoice: 1, type: 1 });
paymentSchema.index({ student: 1, paidAt: -1 });

paymentSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

paymentSchema.plugin(softDeletePlugin);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
