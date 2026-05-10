import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/holidays.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.softRemove(req.params.id);
  res.json({ success: true, message: "Bayram o'chirildi" });
});

export default remove;
