import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/adminDashboard.service.js";

const incomeByDirection = asyncHandler(async (req, res) => {
  const data = await service.getIncomeByDirection(req.query);
  res.json({ success: true, data });
});

export default incomeByDirection;
