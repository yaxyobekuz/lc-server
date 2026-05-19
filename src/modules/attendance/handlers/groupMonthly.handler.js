import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendance.service.js";

const groupMonthly = asyncHandler(async (req, res) => {
  const data = await service.getGroupMonthly(req.params.groupId, {
    year: Number(req.query.year),
    month: Number(req.query.month),
  });
  res.json({ success: true, data });
});

export default groupMonthly;
