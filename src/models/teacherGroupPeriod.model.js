import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// O'qituvchining bir guruhda dars bergan KUN-darajali MAOSH davri - MANBA HAQIQATI.
// Group.teachers[] (tarixsiz massiv) o'rnini bosadi. startDate majburiy;
// endDate=null → hozir ham dars bermoqda (EXCLUSIVE - GroupMembership.leftAt va
// davomat encoding bilan bir xil). (teacher, group) scope ichida faqat bitta
// ochiq davr; bir o'qituvchining davrlari kesishmaydi (period.helper - servisda).
// Turli o'qituvchilar bir vaqtda dars berishi mumkin (scope juftlik bo'yicha).
// Davr o'zida MAOSH stavkasini ham saqlaydi (salaryType/fixedAmount/percentRate) -
// har bir maosh o'zgarishi yangi davr ochadi (oy o'rtasida tur o'zgarishi ham).
const teacherGroupPeriodSchema = new mongoose.Schema(
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
    startDate: { type: Date, required: true },
    // EXCLUSIVE tugash sanasi. null → ochiq (davom etayotgan) davr.
    endDate: { type: Date, default: null },
    // Maosh stavkasi - shu davrga amal qiladi.
    salaryType: { type: String, enum: ["fixed", "percent", "mixed"], default: "fixed" },
    fixedAmount: { type: Number, min: 0, default: 0 },
    percentRate: { type: Number, min: 0, max: 100, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

teacherGroupPeriodSchema.index({ group: 1, startDate: 1 });
teacherGroupPeriodSchema.index({ teacher: 1, startDate: 1 });

teacherGroupPeriodSchema.plugin(softDeletePlugin);

const TeacherGroupPeriod = mongoose.model(
  "TeacherGroupPeriod",
  teacherGroupPeriodSchema,
);

export default TeacherGroupPeriod;
