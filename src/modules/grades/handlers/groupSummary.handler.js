import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/grades.service.js";

const groupSummary = asyncHandler(async (req, res) => {
  const data = await service.getGroupSummary(req.params.groupId, {
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
  });
  res.json({ success: true, data });
});

export default groupSummary;
