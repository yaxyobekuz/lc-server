import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryReportService from "../services/salaryReport.service.js";

const regenerate = asyncHandler(async (req, res) => {
  const data = await salaryReportService.regenerate(req.body.year, req.body.month);
  res.json({ success: true, data, message: "Generatsiya yakunlandi" });
});

export default regenerate;
