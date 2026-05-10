import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const removeAdjustment = asyncHandler(async (req, res) => {
  const data = await service.removeAdjustment(
    req.params.id,
    req.params.adjId,
    req.user,
  );
  res.json({ success: true, data, message: "O'chirildi" });
});

export default removeAdjustment;
