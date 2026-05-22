import SalarySettings from "../../../models/salarySettings.model.js";
import ApiError from "../../../utils/ApiError.js";

export const get = async () => {
  return SalarySettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { _id: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

export const update = async (body) => {
  const doc = await get();

  if (body.defaultHoursPerSession !== undefined) {
    const v = Number(body.defaultHoursPerSession);
    if (!Number.isFinite(v) || v < 0) {
      throw new ApiError(400, "Soat manfiy bo'lmasin");
    }
    doc.defaultHoursPerSession = v;
  }
  if (body.autoCalculateOnDay !== undefined) {
    const v = Number(body.autoCalculateOnDay);
    if (!Number.isInteger(v) || v < 1 || v > 28) {
      throw new ApiError(400, "Hisoblash kuni 1 dan 28 gacha bo'lishi kerak");
    }
    doc.autoCalculateOnDay = v;
  }
  if (body.notifyOnCalculated !== undefined) {
    doc.notifyOnCalculated = !!body.notifyOnCalculated;
  }
  if (body.notifyOnPaid !== undefined) {
    doc.notifyOnPaid = !!body.notifyOnPaid;
  }

  await doc.save();

  // Avto hisoblash kuni o'zgargan bo'lsa Agenda jobi qayta sozlanadi
  if (body.autoCalculateOnDay !== undefined) {
    try {
      const { rescheduleSalaryJob } = await import("../../../jobs/index.js");
      await rescheduleSalaryJob(doc.autoCalculateOnDay);
    } catch {
      /* noop - Agenda hali ishga tushmagan bo'lishi mumkin */
    }
  }
  return doc;
};
