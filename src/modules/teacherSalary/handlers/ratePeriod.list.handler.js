import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryRatePeriodService from "../services/salaryRatePeriod.service.js";

const list = asyncHandler(async (req, res) => {
  const data = await salaryRatePeriodService.listByPair(req.query.teacher, req.query.group);
  res.json({ success: true, data });
});

export default list;
