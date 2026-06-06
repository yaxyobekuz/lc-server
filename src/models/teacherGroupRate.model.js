import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

export const CALCULATION_TYPES = [
  "fixed",
  "hourly",
  "percentage",
  "per_student",
  "mixed",
];

const teacherGroupRateSchema = new mongoose.Schema(
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
    calculationType: {
      type: String,
      enum: CALCULATION_TYPES,
      required: true,
    },
    fixedAmount: { type: Number, default: 0, min: 0 },
    hourlyRate: { type: Number, default: 0, min: 0 },
    hoursPerSession: { type: Number, default: 2, min: 0 },
    percentageRate: { type: Number, default: 0, min: 0, max: 100 },
    // Har bir o'quvchidan olinadigan summa (per_student)
    amountPerStudent: { type: Number, default: 0, min: 0 },
    minMonthlyAmount: { type: Number, default: 0, min: 0 },
    effectiveFrom: { type: Date, default: Date.now },
    // O'qituvchi shu guruhda to'xtagan sana (almashtirilganda). null → hali faol.
    effectiveTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

// Bir o'qituvchi-guruh juftligi uchun faqat bitta active stavka
teacherGroupRateSchema.index(
  { teacher: 1, group: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
teacherGroupRateSchema.index({ teacher: 1, isActive: 1 });
teacherGroupRateSchema.index({ group: 1, isActive: 1 });

teacherGroupRateSchema.pre("validate", function (next) {
  const t = this.calculationType;
  const hasFixed = this.fixedAmount > 0;
  const hasHourly = this.hourlyRate > 0;
  const hasPercentage = this.percentageRate > 0;
  const hasPerStudent = this.amountPerStudent > 0;

  if (t === "fixed" && !hasFixed) {
    return next(new Error("Belgilangan summa 0 dan katta bo'lishi kerak"));
  }
  if (t === "hourly" && !hasHourly) {
    return next(new Error("Soatlik stavka 0 dan katta bo'lishi kerak"));
  }
  if (t === "percentage" && !hasPercentage) {
    return next(new Error("Foiz ulushi 0 dan katta bo'lishi kerak"));
  }
  if (t === "per_student" && !hasPerStudent) {
    return next(
      new Error("Har bir o'quvchidan summa 0 dan katta bo'lishi kerak"),
    );
  }
  if (t === "mixed" && !hasFixed && !hasHourly && !hasPercentage && !hasPerStudent) {
    return next(
      new Error("Aralash uchun kamida bitta komponent kiritilishi kerak"),
    );
  }
  next();
});

teacherGroupRateSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

teacherGroupRateSchema.plugin(softDeletePlugin);

const TeacherGroupRate = mongoose.model(
  "TeacherGroupRate",
  teacherGroupRateSchema,
);

export default TeacherGroupRate;
