import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/paymentMethods.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.softRemove(req.params.id);
  res.json({ success: true, message: "To'lov usuli arxivlandi" });
});

export default remove;
