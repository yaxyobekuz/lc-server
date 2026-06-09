import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

export const SALARY_STATUSES = [
  "calculated",
  "approved",
  "partial",
  "paid",
  "cancelled",
];
export const ADJUSTMENT_TYPES = ["bonus", "penalty", "advance", "deduction"];

const groupBreakdownSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
    groupName: { type: String, default: "" },
    calculationType: { type: String, default: "fixed" },
    sessionsCount: { type: Number, default: 0, min: 0 },
    hoursPerSession: { type: Number, default: 0, min: 0 },
    totalHours: { type: Number, default: 0, min: 0 },
    hourlyRate: { type: Number, default: 0, min: 0 },
    hourlyAmount: { type: Number, default: 0, min: 0 },
    fixedAmount: { type: Number, default: 0, min: 0 },
    studentPaymentsTotal: { type: Number, default: 0, min: 0 },
    percentageRate: { type: Number, default: 0, min: 0 },
    percentageAmount: { type: Number, default: 0, min: 0 },
    studentsCount: { type: Number, default: 0, min: 0 },
    amountPerStudent: { type: Number, default: 0, min: 0 },
    perStudentAmount: { type: Number, default: 0, min: 0 },
    minMonthlyAmount: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const adjustmentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ADJUSTMENT_TYPES, required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const salarySchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    period: {
      year: { type: Number, required: true },
      month: { type: Number, required: true, min: 1, max: 12 },
    },
    groupBreakdowns: { type: [groupBreakdownSchema], default: [] },
    baseAmount: { type: Number, default: 0, min: 0 },
    adjustments: { type: [adjustmentSchema], default: [] },
    bonusTotal: { type: Number, default: 0, min: 0 },
    penaltyTotal: { type: Number, default: 0, min: 0 },
    advanceTotal: { type: Number, default: 0, min: 0 },
    deductionTotal: { type: Number, default: 0, min: 0 },
    finalAmount: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: SALARY_STATUSES,
      default: "calculated",
      index: true,
    },
    calculatedAt: { type: Date, default: Date.now },
    calculatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelledAt: { type: Date, default: null },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelledReason: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

// Bir o'qituvchi-oy uchun faqat bitta non-cancelled salary.
// MongoDB partial index'da $ne QO'LLAB-QUVVATLANMAYDI (index qurilmaydi) — shuning
// uchun bekor qilinmagan statuslarni $in bilan aniq sanab beramiz (S-7 fix).
salarySchema.index(
  { teacher: 1, "period.year": 1, "period.month": 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["calculated", "approved", "partial", "paid"] },
    },
  },
);
salarySchema.index({ "period.year": -1, "period.month": -1 });

salarySchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

salarySchema.plugin(softDeletePlugin);

const Salary = mongoose.model("Salary", salarySchema);

export default Salary;
