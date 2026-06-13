import mongoose from "mongoose";

// O'qituvchi + guruh uchun STABIL (doimiy) maosh konfiguratsiyasi. Owner buni
// BIR MARTA belgilaydi - har oy generatsiyasi shu yerdan maosh turi/foiz/fiksani
// oladi. Shu bilan har oy qo'lda maosh kiritish shart emas (soddalashtirish).
//
// Oylik TeacherSalary yozuvi bundan farq qiladi: u har oyning HISOBLANGAN
// snapshot'i (groupRevenue, prorated, to'langan...). Bu model esa faqat "qoida".
const teacherSalaryConfigSchema = new mongoose.Schema(
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

    // Stabil maosh qoidasi (oylik yozuvga ko'chiriladi)
    salaryType: {
      type: String,
      enum: ["fixed", "percent", "mixed"],
      default: "percent",
    },
    fixedAmount: { type: Number, min: 0, default: 0 },
    // Guruh tushumidan o'qituvchiga tegadigan stabil foiz (per o'quvchi emas -
    // guruhning umumiy hisoblangan tushumiga nisbatan, oylik snapshot kabi).
    percentRate: { type: Number, min: 0, max: 100, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// O'qituvchi + guruh uchun bitta config
teacherSalaryConfigSchema.index({ teacher: 1, group: 1 }, { unique: true });

const TeacherSalaryConfig = mongoose.model(
  "TeacherSalaryConfig",
  teacherSalaryConfigSchema,
);

export default TeacherSalaryConfig;
