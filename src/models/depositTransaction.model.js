import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// Depozit ledgeri: pul KIRIM (topup), CHIQIM (withdraw), va plan kamayganda
// QAYTARIM (refund - ortiqcha qoplama depozitga qaytadi). Depozit↔plan QOPLAMA
// (apply) bu yerda EMAS - u PaymentTransaction(source:"deposit") da (daromad).
// Bu yozuvlar tizim daromad/xarajatiga KIRMAYDI.
const depositTransactionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deposit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentDeposit",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["topup", "withdraw", "refund"],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 1, max: 50_000_000 },
    // Naqd/karta - topup/withdraw uchun. refund (plan→depozit) uchun ahamiyatsiz.
    method: { type: String, enum: ["cash", "card"], default: "cash" },
    // Amaldan keyingi balans (audit/ko'rsatish uchun snapshot).
    balanceAfter: { type: Number, default: 0 },
    note: { type: String, trim: true, default: "" },
    paidAt: { type: Date, required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

depositTransactionSchema.index({ student: 1, paidAt: -1 });

depositTransactionSchema.plugin(softDeletePlugin);

const DepositTransaction = mongoose.model(
  "DepositTransaction",
  depositTransactionSchema,
);

export default DepositTransaction;
