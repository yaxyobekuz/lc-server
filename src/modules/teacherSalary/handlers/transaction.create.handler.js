import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryTransactionService from "../services/salaryTransaction.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await salaryTransactionService.create(req.body, req.user);
  res.status(201).json({ success: true, data, message: "To'lov amalga oshirildi" });
});

export default create;
