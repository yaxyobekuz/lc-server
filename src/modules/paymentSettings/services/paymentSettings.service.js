import PaymentSettings from "../../../models/paymentSettings.model.js";
import ApiError from "../../../utils/ApiError.js";

export const get = async () => {
  return PaymentSettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { _id: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

export const update = async (body) => {
  const doc = await get();

  if (body.dueDayOfMonth !== undefined) {
    const v = Number(body.dueDayOfMonth);
    if (!Number.isInteger(v) || v < 1 || v > 28) {
      throw new ApiError(400, "To'lov muddati 1 dan 28 gacha bo'lishi kerak");
    }
    doc.dueDayOfMonth = v;
  }
  if (body.remindBeforeDays !== undefined) {
    const v = Number(body.remindBeforeDays);
    if (!Number.isInteger(v) || v < 0) {
      throw new ApiError(400, "Eslatma kuni manfiy bo'lmasin");
    }
    doc.remindBeforeDays = v;
  }
  if (body.repeatAfterOverdueDays !== undefined) {
    const v = Number(body.repeatAfterOverdueDays);
    if (!Number.isInteger(v) || v < 0) {
      throw new ApiError(400, "Takror muddati manfiy bo'lmasin");
    }
    doc.repeatAfterOverdueDays = v;
  }
  if (body.reminderEnabled !== undefined) {
    doc.reminderEnabled = !!body.reminderEnabled;
  }
  if (body.centerName !== undefined) {
    doc.centerName = String(body.centerName).trim() || "Bayyina";
  }
  if (body.groupPriceChangeMode !== undefined) {
    doc.groupPriceChangeMode = body.groupPriceChangeMode;
  }
  if (body.teacherAbsenceMode !== undefined) {
    doc.teacherAbsenceMode = body.teacherAbsenceMode;
  }
  if (body.teacherAbsenceAmount !== undefined) {
    doc.teacherAbsenceAmount = Math.max(0, Number(body.teacherAbsenceAmount) || 0);
  }

  await doc.save();
  return doc;
};
