import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/teacherAttendance.service.js";

const listForDate = asyncHandler(async (req, res) => {
  const data = await service.listForDate(req.query.date);
  res.json({ success: true, data });
});

export default listForDate;
