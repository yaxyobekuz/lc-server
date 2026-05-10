import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/adminDashboard.service.js";

const forecast = asyncHandler(async (_req, res) => {
  const data = await service.forecastNextMonth();
  res.json({ success: true, data });
});

export default forecast;
