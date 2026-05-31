import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const teacherReport = asyncHandler(async (req, res) => {
  const data = await service.getTeacherReport(req.query);
  res.json({ success: true, data });
});

export default teacherReport;
