import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const removePayout = asyncHandler(async (req, res) => {
  const data = await service.removePayout(req.params.payoutId, req.user);
  res.json({ success: true, data, message: "To'lov o'chirildi" });
});

export default removePayout;
