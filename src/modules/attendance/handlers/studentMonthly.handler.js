import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendance.service.js";

const studentMonthly = asyncHandler(async (req, res) => {
  const data = await service.getStudentMonthly(req.params.id, {
    year: Number(req.query.year),
    month: Number(req.query.month),
    scopeGroupIds: req.scopeGroupIds,
  });
  res.json({ success: true, data });
});

export default studentMonthly;
