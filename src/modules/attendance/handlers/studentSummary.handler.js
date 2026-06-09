import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendance.service.js";

const studentSummary = asyncHandler(async (req, res) => {
  const data = await service.getStudentSummary(req.params.id, {
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    scopeGroupIds: req.scopeGroupIds,
  });
  res.json({ success: true, data });
});

export default studentSummary;
