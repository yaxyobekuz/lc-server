import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherSalaryService from "../services/teacherSalary.service.js";

const getById = asyncHandler(async (req, res) => {
  const data = await teacherSalaryService.getById(req.params.id);
  res.json({ success: true, data });
});

export default getById;
