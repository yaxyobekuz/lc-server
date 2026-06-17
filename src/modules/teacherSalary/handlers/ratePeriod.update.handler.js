import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryRatePeriodService from "../services/salaryRatePeriod.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await salaryRatePeriodService.update(req.params.id, req.body, req.user);
  res.json({ success: true, data, message: "Maosh stavkasi davri yangilandi" });
});

export default update;
