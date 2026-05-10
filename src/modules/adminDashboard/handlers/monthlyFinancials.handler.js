import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/adminDashboard.service.js";

const monthlyFinancials = asyncHandler(async (req, res) => {
  const data = await service.getMonthlyFinancials(req.query);
  res.json({ success: true, data });
});

export default monthlyFinancials;
