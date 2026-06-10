import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// Alohida to'lov (kirim). Bitta oylik to'lov bir nechta tranzaksiyaga bo'linishi
// mumkin (qisman naqd/karta). student/group/year/month - hisobot uchun denormalizatsiya.
const paymentTransactionSchema = new mongoose.Schema(
  {
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentPayment",
      required: true,
      index: true,
    },
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
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["cash", "card"], required: true },
    paidAt: { type: Date, required: true, index: true },
    note: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Kunlik kirim grafigi uchun
paymentTransactionSchema.index({ year: 1, month: 1, paidAt: 1 });

paymentTransactionSchema.plugin(softDeletePlugin);

const PaymentTransaction = mongoose.model(
  "PaymentTransaction",
  paymentTransactionSchema,
);

export default PaymentTransaction;
