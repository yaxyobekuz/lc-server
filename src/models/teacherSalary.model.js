import mongoose from "mongoose";

// O'qituvchining bir guruh, bir oy uchun oylik maoshi. Maosh turi: fiksa, foiz
// (guruh tushumidan %), yoki aralash. Snapshot maydonlar recalc() orqali yangilanadi.
// O'chirilmaydi (softDelete yo'q) - o'quvchi to'lovi modeli kabi.
const teacherSalarySchema = new mongoose.Schema(
  {
    teacher: {
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

    // Maosh konfiguratsiyasi (qo'lda kiritiladi / carry-forward)
    salaryType: {
      type: String,
      enum: ["fixed", "percent", "mixed"],
      default: "fixed",
    },
    fixedAmount: { type: Number, min: 0, default: 0 },
    percentRate: { type: Number, min: 0, max: 100, default: 0 },
    workStartDate: { type: Date, default: null },
    workEndDate: { type: Date, default: null },

    // Snapshot (recalc paytida yangilanadi)
    groupRevenue: { type: Number, default: 0 },
    prorationFactor: { type: Number, default: 1 },
    payableDays: { type: Number, default: 0 },
    totalDays: { type: Number, default: 0 },
    proratedFixed: { type: Number, default: 0 },
    percentAmount: { type: Number, default: 0 },
    baseEarnings: { type: Number, default: 0 },
    expectedAmount: { type: Number, required: true, default: 0 },

    // To'langan (SalaryTransaction yig'indisidan keshlanadi)
    paidAmount: { type: Number, default: 0 },
    // expectedAmount keyinchalik (retro chegirma/fee o'zgarishi) kamayib,
    // to'langan summa undan oshib qolsa - farq shu yerda KO'RINADIGAN bo'lib
    // saqlanadi (clamp bilan yashirilmaydi, clawback uchun asos).
    overpaidAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
      index: true,
    },
    source: { type: String, enum: ["auto", "manual"], default: "auto" },
    recalculatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// O'qituvchi + guruh + oy uchun bitta yozuv
teacherSalarySchema.index(
  { teacher: 1, group: 1, year: 1, month: 1 },
  { unique: true },
);
// Hisobotlar uchun
teacherSalarySchema.index({ year: 1, month: 1, status: 1 });

const TeacherSalary = mongoose.model("TeacherSalary", teacherSalarySchema);

export default TeacherSalary;
