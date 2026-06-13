import mongoose from "mongoose";

// O'quvchiga qaytarilgan ortiqcha pul yozuvi. Guruhdan ketgan o'quvchi to'lovni
// to'liq (yoki avans) qilib, oy o'rtasida chiqib ketsa - proratsiya tufayli
// expectedAmount kamayadi, lekin paidAmount o'sha-o'sha qoladi. Ortiqchasi
// (paidAmount - expectedAmount) qaytarilishi kerak. Owner "Qaytarish" tugmasini
// bosganda shu yozuv yaratiladi va o'sha summa "qaytarilgan" deb hisoblanadi.
//
// Bitta studentPayment uchun bir nechta refund bo'lishi mumkin emas, lekin
// bir o'quvchining har bir guruh/oy to'lovi alohida refundga ega bo'ladi.
const refundSchema = new mongoose.Schema(
  {
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentPayment",
      required: true,
      // Bir to'lov uchun faqat bitta refund (takror qaytarishni to'sadi)
      unique: true,
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

    // Qaytarilgan summa (yaratish paytidagi paidAmount - expectedAmount snapshot'i)
    amount: { type: Number, required: true, min: 1 },
    note: { type: String, trim: true, default: "" },

    refundedAt: { type: Date, default: Date.now, index: true },
    refundedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Hisobotlar (oy bo'yicha qaytarilgan pul) uchun
refundSchema.index({ year: 1, month: 1 });

const Refund = mongoose.model("Refund", refundSchema);

export default Refund;
