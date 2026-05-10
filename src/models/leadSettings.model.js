import mongoose from "mongoose";

const leadSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },
    reminderEnabled: { type: Boolean, default: true },
    remindHourOfDay: { type: Number, default: 9, min: 0, max: 23 },
    overdueDaysThreshold: { type: Number, default: 7, min: 1 },
  },
  { timestamps: true, _id: false },
);

leadSettingsSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const LeadSettings = mongoose.model("LeadSettings", leadSettingsSchema);

export default LeadSettings;
