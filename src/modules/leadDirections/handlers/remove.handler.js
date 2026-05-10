import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leadDirections.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.softRemove(req.params.id);
  res.json({ success: true, message: "Yo'nalish o'chirildi" });
});

export default remove;
