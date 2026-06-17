import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherGroupPeriodService from "../services/teacherGroupPeriod.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await teacherGroupPeriodService.remove(req.params.periodId);
  res.json({ success: true, data, message: "Dars berish davri o'chirildi" });
});

export default remove;
