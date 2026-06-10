import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryAdjustmentService from "../services/salaryAdjustment.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await salaryAdjustmentService.update(req.params.id, req.body);
  res.json({ success: true, data, message: "Yangilandi" });
});

export default update;
