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

    amount: { type: Number, required: true, min: 1, max: 50_000_000 },
    // To'g'ridan-to'g'ri (naqd/karta) yoki o'quvchi depozitidan qoplama.
    // "deposit" → bu PaymentTransaction depozit balansidan yechilgan (depozit
    // qaytarilsa shu yozuv reverse qilinadi). Daromad ikkalasida ham sanaladi.
    source: { type: String, enum: ["direct", "deposit"], default: "direct", index: true },
    // direct uchun majburiy (validatorda); deposit-qoplamada ahamiyatsiz.
    method: { type: String, enum: ["cash", "card"], default: "cash" },
    paidAt: { type: Date, required: true, index: true },
    note: { type: String, trim: true, default: "" },
    // Kliyent yuborgan takrorlanmas kalit - double-click/retry bir xil to'lovni
    // ikki marta yozmasligi uchun (faqat batch'ning birinchi tranzaksiyasida).
    idempotencyKey: { type: String, default: null },
    // Bitta naqd to'lov bir nechta oyga (avans) taqsimlanganda barcha bo'laklarni
    // bog'laydi - bekor qilishda BUTUN batch birga void bo'ladi (fantom avans qolmaydi).
    batchId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Kunlik kirim grafigi uchun
paymentTransactionSchema.index({ year: 1, month: 1, paidAt: 1 });
// Idempotentlik: bir xil kalit bilan ikkinchi yozuv E11000 bilan rad etiladi
paymentTransactionSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

paymentTransactionSchema.plugin(softDeletePlugin);

const PaymentTransaction = mongoose.model(
  "PaymentTransaction",
  paymentTransactionSchema,
);

export default PaymentTransaction;
