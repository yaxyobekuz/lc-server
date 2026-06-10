import mongoose from "mongoose";

// O'quvchining bir guruh, bir oy uchun oylik to'lovi. Snapshot maydonlar
// (baseFee/prorationFactor/discountApplied/expectedAmount) fee/chegirma/muzlatish
// o'zgarganda recalc() orqali yangilanadi. O'chirilmaydi (softDelete yo'q).
const studentPaymentSchema = new mongoose.Schema(
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
    membership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupMembership",
      default: null,
    },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    // Snapshot (recalc paytida yangilanadi)
    baseFee: { type: Number, required: true, default: 0 },
    prorationFactor: { type: Number, default: 1 },
    discountApplied: { type: Number, default: 0 },
    expectedAmount: { type: Number, required: true, default: 0 },

    // To'langan (PaymentTransaction yig'indisidan keshlanadi)
    paidAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
      index: true,
    },
    recalculatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// O'quvchi + guruh + oy uchun bitta yozuv
studentPaymentSchema.index(
  { student: 1, group: 1, year: 1, month: 1 },
  { unique: true },
);
// Hisobotlar uchun
studentPaymentSchema.index({ year: 1, month: 1, status: 1 });

const StudentPayment = mongoose.model("StudentPayment", studentPaymentSchema);

export default StudentPayment;
