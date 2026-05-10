import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/paymentMethods.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.body);
  res.status(201).json({
    success: true,
    data,
    message: "To'lov usuli yaratildi",
  });
});

export default create;
