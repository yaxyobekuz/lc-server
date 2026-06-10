import asyncHandler from "../../../middleware/asyncHandler.js";
import * as discountService from "../services/discount.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await discountService.create(req.body, req.user);
  res.status(201).json({ success: true, data, message: "Chegirma qo'shildi" });
});

export default create;
