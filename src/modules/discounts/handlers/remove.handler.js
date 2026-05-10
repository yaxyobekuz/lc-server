import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/discounts.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ success: true, message: "Chegirma o'chirildi" });
});

export default remove;
