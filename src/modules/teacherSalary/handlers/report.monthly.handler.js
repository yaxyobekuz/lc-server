import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryReportService from "../services/salaryReport.service.js";

const monthly = asyncHandler(async (req, res) => {
  const data = await salaryReportService.monthly(req.query);
  res.json({ success: true, data });
});

export default monthly;
