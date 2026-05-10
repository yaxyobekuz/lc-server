import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendance.service.js";

const dashboard = asyncHandler(async (req, res) => {
  const data = await service.getDashboardStats({
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
  });
  res.json({ success: true, data });
});

export default dashboard;
