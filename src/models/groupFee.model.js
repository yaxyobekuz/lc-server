import mongoose from "mongoose";

// Guruhning bir oy uchun belgilangan to'lov miqdori (butun son UZS).
// Har oy uchun avtomatik yaratiladi (Agenda), keyin qo'lda tahrirlanadi.
// O'chirilmaydi - shuning uchun softDelete plugin qo'yilmagan.
const groupFeeSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    year: { type: Number, required: true, min: 2000, max: 3000 },
    month: { type: Number, required: true, min: 1, max: 12 },
    amount: { type: Number, required: true, min: 0, default: 0 },
    // Yangi summa qaysi sanadan kuchga kiradi (proratsiya shu kundan boshlanadi).
    // null → butun oy. Carry-forward bilan keyingi oyga tarqalmaydi.
    effectiveFrom: { type: Date, default: null },
    // Oy o'rtasida tarif O'ZGARTIRILGANDA effectiveFrom'dan oldingi kunlar uchun
    // amal qilgan eski tarif. null → oldingi davr hisoblanmaydi (oy o'rtasidan
    // billing boshlanadigan yangi fee). Aralash hisob: eski×oldingi + yangi×keyingi.
    previousAmount: { type: Number, min: 0, default: null },
    // "auto" - job carry-forward; "manual" - qo'lda tahrirlangan
    source: { type: String, enum: ["auto", "manual"], default: "auto" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Bir guruh + bir oy uchun bitta to'lov (idempotent generatsiya shu indeksga tayanadi)
groupFeeSchema.index({ group: 1, year: 1, month: 1 }, { unique: true });

const GroupFee = mongoose.model("GroupFee", groupFeeSchema);

export default GroupFee;
