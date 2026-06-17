import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryRatePeriodService from "../services/salaryRatePeriod.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await salaryRatePeriodService.remove(req.params.id);
  res.json({ success: true, data, message: "Maosh stavkasi davri o'chirildi" });
});

export default remove;
