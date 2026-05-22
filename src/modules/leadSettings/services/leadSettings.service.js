import LeadSettings from "../../../models/leadSettings.model.js";
import ApiError from "../../../utils/ApiError.js";

export const get = async () => {
  return LeadSettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { _id: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

export const update = async (body) => {
  const doc = await get();

  if (body.reminderEnabled !== undefined) {
    doc.reminderEnabled = !!body.reminderEnabled;
  }
  if (body.remindHourOfDay !== undefined) {
    const v = Number(body.remindHourOfDay);
    if (!Number.isInteger(v) || v < 0 || v > 23) {
      throw new ApiError(400, "Eslatma soati 0 dan 23 gacha bo'lishi kerak");
    }
    doc.remindHourOfDay = v;
  }
  if (body.overdueDaysThreshold !== undefined) {
    const v = Number(body.overdueDaysThreshold);
    if (!Number.isInteger(v) || v < 1) {
      throw new ApiError(400, "Kechikish kuni kamida 1 bo'lishi kerak");
    }
    doc.overdueDaysThreshold = v;
  }

  await doc.save();

  // Eslatma soati o'zgargan bo'lsa Agenda jobi qayta sozlanadi
  if (body.remindHourOfDay !== undefined) {
    try {
      const { rescheduleLeadReminders } = await import(
        "../../../jobs/index.js"
      );
      await rescheduleLeadReminders(doc.remindHourOfDay);
    } catch {
      /* noop - Agenda hali ishga tushmagan bo'lishi mumkin */
    }
  }
  return doc;
};
