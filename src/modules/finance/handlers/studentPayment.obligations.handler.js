import asyncHandler from "../../../middleware/asyncHandler.js";
import * as studentPaymentService from "../services/studentPayment.service.js";

const obligations = asyncHandler(async (req, res) => {
  const data = await studentPaymentService.obligations(req.query);
  res.json({ success: true, data });
});

export default obligations;
