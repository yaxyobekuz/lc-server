import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherSalaryService from "../services/teacherSalary.service.js";

const historyByTeacher = asyncHandler(async (req, res) => {
  const data = await teacherSalaryService.historyByTeacher(
    req.params.teacherId,
  );
  res.json({ success: true, data });
});

export default historyByTeacher;
