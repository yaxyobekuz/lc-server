import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const approve = asyncHandler(async (req, res) => {
  const data = await service.approve(req.params.id, req.user);
  res.json({ success: true, data, message: "Oylik tasdiqlandi" });
});

export default approve;
