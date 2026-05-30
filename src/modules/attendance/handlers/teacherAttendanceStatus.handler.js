import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/teacherAbsence.service.js";

const teacherAttendanceStatus = asyncHandler(async (req, res) => {
  const data = await service.getStatus(req.params.groupId, req.query.date);
  res.json({ success: true, data });
});

export default teacherAttendanceStatus;
