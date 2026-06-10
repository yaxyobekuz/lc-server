import asyncHandler from "../../../middleware/asyncHandler.js";
import * as discountService from "../services/discount.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await discountService.update(req.params.id, req.body);
  res.json({ success: true, data, message: "Chegirma yangilandi" });
});

export default update;
