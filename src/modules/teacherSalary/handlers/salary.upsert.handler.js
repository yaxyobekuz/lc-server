import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherSalaryService from "../services/teacherSalary.service.js";

const upsert = asyncHandler(async (req, res) => {
  const data = await teacherSalaryService.upsertSalary(req.body, req.user);
  res.json({ success: true, data, message: "Maosh saqlandi" });
});

export default upsert;
