import asyncHandler from "../../../middleware/asyncHandler.js";
import * as debtService from "../services/debt.service.js";

const writeOffCancel = asyncHandler(async (req, res) => {
  const data = await debtService.cancelWriteOff(req.params.studentId, req.user);
  res.json({ success: true, data, message: "Hisobdan chiqarish bekor qilindi" });
});

export default writeOffCancel;
