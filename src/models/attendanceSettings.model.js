import mongoose from "mongoose";

const attendanceSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },
    lowAttendanceThreshold: { type: Number, min: 0, max: 100, default: 60 },
    consecutiveAbsencesAlert: { type: Number, min: 1, default: 3 },
  },
  { timestamps: true, _id: false },
);

attendanceSettingsSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const AttendanceSettings = mongoose.model(
  "AttendanceSettings",
  attendanceSettingsSchema,
);

export default AttendanceSettings;
