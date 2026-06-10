import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherSalaryService from "../services/teacherSalary.service.js";

const obligations = asyncHandler(async (req, res) => {
  const data = await teacherSalaryService.obligations(req.query);
  res.json({ success: true, data });
});

export default obligations;
