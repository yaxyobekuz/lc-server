import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryAdjustmentService from "../services/salaryAdjustment.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await salaryAdjustmentService.create(req.body, req.user);
  res.status(201).json({ success: true, data, message: "Saqlandi" });
});

export default create;
