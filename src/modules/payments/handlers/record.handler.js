import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/payments.service.js";

const record = asyncHandler(async (req, res) => {
  const data = await service.record(req.body, req.user);
  res.status(201).json({
    success: true,
    data,
    message: "To'lov qabul qilindi",
  });
});

export default record;
