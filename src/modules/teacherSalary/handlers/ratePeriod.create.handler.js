import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryRatePeriodService from "../services/salaryRatePeriod.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await salaryRatePeriodService.create(req.body, req.user);
  res.status(201).json({ success: true, data, message: "Maosh stavkasi davri qo'shildi" });
});

export default create;
