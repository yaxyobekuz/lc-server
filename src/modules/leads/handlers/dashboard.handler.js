import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const dashboard = asyncHandler(async (req, res) => {
  const data = await service.getDashboardStats(req.query);
  res.json({ success: true, data });
});

export default dashboard;
