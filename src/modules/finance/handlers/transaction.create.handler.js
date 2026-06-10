import asyncHandler from "../../../middleware/asyncHandler.js";
import * as transactionService from "../services/transaction.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await transactionService.create(req.body, req.user);
  res.status(201).json({ success: true, data, message: "To'lov qabul qilindi" });
});

export default create;
