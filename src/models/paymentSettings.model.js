import mongoose from "mongoose";

const paymentSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },
    dueDayOfMonth: { type: Number, min: 1, max: 28, default: 10 },
    remindBeforeDays: { type: Number, min: 0, default: 3 },
    repeatAfterOverdueDays: { type: Number, min: 0, default: 3 },
    reminderEnabled: { type: Boolean, default: true },
    centerName: { type: String, default: "Bayyina" },
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
