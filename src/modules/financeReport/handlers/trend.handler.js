import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/financeReport.service.js";

const trend = asyncHandler(async (req, res) => {
  const data = await service.getTrend(req.query);
  res.json({ success: true, data });
});

export default trend;
