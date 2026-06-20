import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/adminDashboard.service.js";

const cashflow = asyncHandler(async (req, res) => {
  const data = await service.getCashflow(req.query);
  res.json({ success: true, data });
});

export default cashflow;
