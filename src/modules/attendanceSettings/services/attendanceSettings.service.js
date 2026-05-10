import AttendanceSettings from "../../../models/attendanceSettings.model.js";
import ApiError from "../../../utils/ApiError.js";

export const get = async () =>
  AttendanceSettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { _id: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

export const update = async (body) => {
  const doc = await get();

  if (body.lowAttendanceThreshold !== undefined) {
    const v = Number(body.lowAttendanceThreshold);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new ApiError(400, "Threshold 0 dan 100 gacha bo'lishi kerak");
    }
    doc.lowAttendanceThreshold = v;
  }
  if (body.consecutiveAbsencesAlert !== undefined) {
    const v = Number(body.consecutiveAbsencesAlert);
    if (!Number.isInteger(v) || v < 1) {
      throw new ApiError(400, "Ketma-ket kunlar soni kamida 1 bo'lsin");
    }
    doc.consecutiveAbsencesAlert = v;
  }

  await doc.save();
  return doc;
};
