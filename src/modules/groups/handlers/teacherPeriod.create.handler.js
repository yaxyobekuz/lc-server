import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherGroupPeriodService from "../services/teacherGroupPeriod.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await teacherGroupPeriodService.create(
    { ...req.body, group: req.params.id },
    req.user,
  );
  res.status(201).json({ success: true, data, message: "Dars berish davri qo'shildi" });
});

export default create;
