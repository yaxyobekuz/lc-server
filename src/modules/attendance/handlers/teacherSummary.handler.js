import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendance.service.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";

const teacherSummary = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.TEACHER) {
    throw new ApiError(403, "Faqat o'qituvchilar uchun");
  }
  const data = await service.getTeacherGroupsSummary(req.user._id, {
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
  });
  res.json({ success: true, data });
});

export default teacherSummary;
