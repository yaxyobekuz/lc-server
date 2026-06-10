import asyncHandler from "../../../middleware/asyncHandler.js";
import * as reportService from "../services/report.service.js";

const monthly = asyncHandler(async (req, res) => {
  const data = await reportService.monthly(req.query);
  res.json({ success: true, data });
});

export default monthly;
