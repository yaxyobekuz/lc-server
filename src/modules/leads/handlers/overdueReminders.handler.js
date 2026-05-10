import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const overdueReminders = asyncHandler(async (_req, res) => {
  const data = await service.getOverdueReminders();
  res.json({ success: true, data });
});

export default overdueReminders;
