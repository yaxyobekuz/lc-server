import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryTransactionService from "../services/salaryTransaction.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await salaryTransactionService.remove(req.params.id, req.user);
  res.json({ success: true, data, message: "To'lov bekor qilindi" });
});

export default remove;
