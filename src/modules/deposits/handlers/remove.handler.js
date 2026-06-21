import asyncHandler from "../../../middleware/asyncHandler.js";
import * as depositService from "../services/deposit.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await depositService.removeDepositTxn(req.params.id, req.user);
  res.json({ success: true, data, message: "Tranzaksiya o'chirildi" });
});

export default remove;
