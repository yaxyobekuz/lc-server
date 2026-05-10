import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/adminDashboard.service.js";

const incomeByTeacher = asyncHandler(async (req, res) => {
  const data = await service.getIncomeByTeacher(req.query);
  res.json({ success: true, data });
});

export default incomeByTeacher;
