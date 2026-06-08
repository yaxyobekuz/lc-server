import mongoose from "mongoose";

const paymentSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },
    dueDayOfMonth: { type: Number, min: 1, max: 28, default: 10 },
    remindBeforeDays: { type: Number, min: 0, default: 3 },
    repeatAfterOverdueDays: { type: Number, min: 0, default: 3 },
    reminderEnabled: { type: Boolean, default: true },
    centerName: { type: String, default: "Bayyina" },
    // Guruh narxi oy o'rtasida o'zgarganda joriy oy hisoblariga qanday ta'sir qilsin:
    //  future_only    — joriy oy hisoblari o'zgarmaydi, yangi narx faqat keyingi oydan
    //  current_unpaid — joriy oyning TO'LANMAGAN/qisman hisoblari yangi narxga o'tadi (to'langanlar himoyalangan)
    //  include_paid   — to'langan hisoblar ham yangilanadi (farq qarz bo'ladi yoki balansga qaytadi)
    groupPriceChangeMode: {
      type: String,
      enum: ["future_only", "current_unpaid", "include_paid"],
      default: "current_unpaid",
    },
    // O'qituvchi kelmagan kun uchun o'quvchidan ayiriladigan dars haqi (global default)
    teacherAbsenceMode: {
      type: String,
      enum: ["auto", "fixed", "none"],
      default: "none",
    },
    teacherAbsenceAmount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, _id: false },
);

paymentSettingsSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const PaymentSettings = mongoose.model("PaymentSettings", paymentSettingsSchema);

export default PaymentSettings;
