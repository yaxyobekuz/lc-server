import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// O'qituvchi kelmagan kunda har bir o'quvchiga qo'llangan chegirma tafsiloti
// (teskari qilish — qaytadan "keldi" — uchun saqlanadi).
const applicationSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },
    deducted: { type: Number, default: 0 },
    balanceCredited: { type: Number, default: 0 },
    appliedBalanceReduced: { type: Number, default: 0 },
  },
  { _id: false },
);

const teacherAbsenceSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    date: { type: Date, required: true },
    dateKey: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak"],
    },
    perStudentAmount: { type: Number, default: 0 },
    applications: { type: [applicationSchema], default: [] },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// Bir guruh uchun bir kunda faqat bitta "kelmadi" yozuvi
teacherAbsenceSchema.index({ group: 1, dateKey: 1 }, { unique: true });

teacherAbsenceSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

teacherAbsenceSchema.plugin(softDeletePlugin);

const TeacherAbsence = mongoose.model("TeacherAbsence", teacherAbsenceSchema);

export default TeacherAbsence;
