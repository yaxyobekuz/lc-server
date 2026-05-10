import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/payments.service.js";

const refund = asyncHandler(async (req, res) => {
  const data = await service.refund(
    req.params.id,
    { amount: req.body.amount, reason: req.body.reason },
    req.user,
  );
  res.json({
    success: true,
    data,
    message: "To'lov qaytarildi",
  });
});

export default refund;
