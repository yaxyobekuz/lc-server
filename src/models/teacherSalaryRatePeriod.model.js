import mongoose from "mongoose";

// O'qituvchining bir guruhdagi maosh STAVKASI bir OY oralig'ida. MANBA HAQIQATI -
// oylik TeacherSalary.salaryType/fixedAmount/percentRate shu davrdan olinadi.
// Stavka o'zgarishi (boshqa narxda oylik) → yangi davr. [start..end] inclusive,
// end=null → hozir ham amalda. (teacher, group) scope ichida faqat bitta ochiq
// davr; davrlar kesishmaydi (period.helper invariantlari - servisda tekshiriladi).
// Eski TeacherSalaryConfig (bitta stabil qoida) ni almashtiradi.
const teacherSalaryRatePeriodSchema = new mongoose.Schema(
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
    salaryType: {
      type: String,
      enum: ["fixed", "percent", "mixed"],
      default: "percent",
    },
    fixedAmount: { type: Number, min: 0, default: 0 },
    percentRate: { type: Number, min: 0, max: 100, default: 0 },
    startYear: { type: Number, required: true, min: 2000, max: 3000 },
    startMonth: { type: Number, required: true, min: 1, max: 12 },
    // Inclusive tugash oyi. null → ochiq (davom etayotgan) davr.
    endYear: { type: Number, default: null, min: 2000, max: 3000 },
    endMonth: { type: Number, default: null, min: 1, max: 12 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

teacherSalaryRatePeriodSchema.index({ teacher: 1, group: 1, startYear: 1, startMonth: 1 });

const TeacherSalaryRatePeriod = mongoose.model(
  "TeacherSalaryRatePeriod",
  teacherSalaryRatePeriodSchema,
);

export default TeacherSalaryRatePeriod;
