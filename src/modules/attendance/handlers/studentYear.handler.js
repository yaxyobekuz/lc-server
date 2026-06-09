import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendance.service.js";

const studentYear = asyncHandler(async (req, res) => {
  const data = await service.getStudentYear(req.params.id, {
    year: Number(req.query.year),
    scopeGroupIds: req.scopeGroupIds,
  });
  res.json({ success: true, data });
});

export default studentYear;
