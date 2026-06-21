import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/financeReport.service.js";

const summary = asyncHandler(async (req, res) => {
  const data = await service.getSummary(req.query);
  res.json({ success: true, data });
});

export default summary;
