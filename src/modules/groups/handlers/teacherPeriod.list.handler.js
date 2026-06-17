import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherGroupPeriodService from "../services/teacherGroupPeriod.service.js";

const list = asyncHandler(async (req, res) => {
  const data = await teacherGroupPeriodService.listByGroup(req.params.id);
  res.json({ success: true, data });
});

export default list;
