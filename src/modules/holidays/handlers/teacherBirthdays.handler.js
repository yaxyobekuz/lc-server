import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/holidays.service.js";

const teacherBirthdays = asyncHandler(async (req, res) => {
  const data = await service.listTeacherBirthdays();
  res.json({ success: true, data });
});

export default teacherBirthdays;
