import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const todayReminders = asyncHandler(async (_req, res) => {
  const data = await service.getTodayReminders();
  res.json({ success: true, data });
});

export default todayReminders;
