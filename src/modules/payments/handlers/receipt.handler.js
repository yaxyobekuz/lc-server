import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/payments.service.js";

const receipt = asyncHandler(async (req, res) => {
  const data = await service.buildReceipt(req.params.id);
  res.json({ success: true, data });
});

export default receipt;
