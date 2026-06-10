import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/retention.service.js";

const retention = asyncHandler(async (req, res) => {
  const data = await service.getRetentionStats(req.query);
  res.json({ success: true, data });
});

export default retention;
