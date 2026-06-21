import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/financeReport.service.js";

const groupBreakdown = asyncHandler(async (req, res) => {
  const data = await service.getGroupBreakdown(req.query);
  res.json({ success: true, data });
});

export default groupBreakdown;
