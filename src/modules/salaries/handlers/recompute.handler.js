import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const recompute = asyncHandler(async (req, res) => {
  const data = await service.recompute(req.params.id, req.user);
  res.json({ success: true, data, message: "Qayta hisoblandi" });
});

export default recompute;
