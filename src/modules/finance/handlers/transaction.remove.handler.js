import asyncHandler from "../../../middleware/asyncHandler.js";
import * as transactionService from "../services/transaction.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await transactionService.remove(req.params.id, req.user);
  res.json({ success: true, data, message: "To'lov bekor qilindi" });
});

export default remove;
