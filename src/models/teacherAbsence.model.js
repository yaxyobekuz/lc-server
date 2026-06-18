import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// O'qituvchi kelmagan kun belgisi (per-guruh proyeksiya). PULGA TA'SIR QILMAYDI:
// o'quvchi to'lovi ham, maosh ham bundan avtomatik o'zgarmaydi - faqat hisobot/
// kuzatuv uchun. (Avvalgi perStudentAmount/applications maydonlari hech qachon
// to'ldirilmagan o'lik kod edi - olib tashlandi, mavjud bo'lmagan "Invoice"
// modeliga ham ishora qilardi.)
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
