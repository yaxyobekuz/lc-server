import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/feedback.service.js";

const stats = asyncHandler(async (req, res) => {
  const data = await service.getStats(req.query);
  res.json({ success: true, data });
});

export default stats;
