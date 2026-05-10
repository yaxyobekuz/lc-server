import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const sourcePerformance = asyncHandler(async (req, res) => {
  const data = await service.getSourcePerformance(req.query);
  res.json({ success: true, data });
});

export default sourcePerformance;
