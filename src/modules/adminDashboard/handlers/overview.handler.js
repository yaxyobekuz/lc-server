import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/adminDashboard.service.js";

const overview = asyncHandler(async (req, res) => {
  const data = await service.getOverview(req.query);
  res.json({ success: true, data });
});

export default overview;
