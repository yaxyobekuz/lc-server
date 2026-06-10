import asyncHandler from "../../../middleware/asyncHandler.js";
import * as discountService from "../services/discount.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await discountService.remove(req.params.id, req.user);
  res.json({ success: true, data, message: "Chegirma o'chirildi" });
});

export default remove;
