import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// O'quvchini vaqtincha "muzlatish" (pauza): startDate..endDate oralig'idagi BARCHA
// dars kunlari davomat hisobidan chiqariladi (foizga ta'sir qilmaydi). Moliyada
// muzlatilgan kalendar kunlari oylik to'lov proratsiyasidan chiqariladi (to'lov kamayadi).
// Butun o'quvchi bo'yicha (barcha guruhlar). endDate=null → ochiq muzlatish.
const studentFreezeSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    reason: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

studentFreezeSchema.index({ student: 1, isActive: 1, startDate: 1 });

studentFreezeSchema.pre("validate", function (next) {
  if (this.endDate && this.startDate > this.endDate) {
    return next(
      new Error("Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak"),
    );
  }
  next();
});

studentFreezeSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

studentFreezeSchema.plugin(softDeletePlugin);

const StudentFreeze = mongoose.model("StudentFreeze", studentFreezeSchema);

export default StudentFreeze;
