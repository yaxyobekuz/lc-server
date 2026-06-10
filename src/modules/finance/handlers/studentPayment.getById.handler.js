import asyncHandler from "../../../middleware/asyncHandler.js";
import * as studentPaymentService from "../services/studentPayment.service.js";

const getById = asyncHandler(async (req, res) => {
  const data = await studentPaymentService.getById(req.params.id);
  res.json({ success: true, data });
});

export default getById;
