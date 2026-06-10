import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryAdjustmentService from "../services/salaryAdjustment.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await salaryAdjustmentService.remove(req.params.id, req.user);
  res.json({ success: true, data, message: "O'chirildi" });
});

export default remove;
