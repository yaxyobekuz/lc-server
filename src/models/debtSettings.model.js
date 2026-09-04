import mongoose from "mongoose";

// Qarz nazorati sozlamalari - yagona hujjat (_id: "default").
// Qarzdorlar ro'yxatidagi XAVF DARAJASI va arxivlash qulfi shu qiymatlarga tayanadi.
const debtSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },

    // Oy boshidan keyin to'lov kutiladigan imtiyoz kunlari. Shu muddat ichidagi
    // joriy oy qarzi "yangi" hisoblanadi va xavf darajasini oshirmaydi.
    graceDays: { type: Number, default: 10, min: 0, max: 31 },

    // Necha oylik qarzdan boshlab "o'rta" va "yuqori" xavf deb belgilansin.
    mediumMonths: { type: Number, default: 1, min: 1, max: 12 },
    highMonths: { type: Number, default: 2, min: 1, max: 12 },

    // Shuncha kundan beri darsga kelmagan qarzdor "kritik" deb belgilanadi -
    // aynan shular to'lamay yo'qolib ketadigan guruh.
    inactivityDays: { type: Number, default: 14, min: 1, max: 365 },

    // Qarzi bor o'quvchini arxivlashda tasdiqlash talab qilinsinmi.
    archiveDebtLock: { type: Boolean, default: true },
  },
  { timestamps: true, _id: false },
);

debtSettingsSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const DebtSettings = mongoose.model("DebtSettings", debtSettingsSchema);

export default DebtSettings;
