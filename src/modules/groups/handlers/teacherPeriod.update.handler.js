import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherGroupPeriodService from "../services/teacherGroupPeriod.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await teacherGroupPeriodService.update(req.params.periodId, req.body, req.user);
  res.json({ success: true, data, message: "Dars berish davri yangilandi" });
});

export default update;
