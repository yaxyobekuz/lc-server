import mongoose from "mongoose";

const salarySettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },
    defaultHoursPerSession: { type: Number, default: 2, min: 0 },
    autoCalculateOnDay: { type: Number, default: 1, min: 1, max: 28 },
    notifyOnCalculated: { type: Boolean, default: true },
    notifyOnPaid: { type: Boolean, default: true },
  },
  { timestamps: true, _id: false },
);

salarySettingsSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const SalarySettings = mongoose.model("SalarySettings", salarySettingsSchema);

export default SalarySettings;
