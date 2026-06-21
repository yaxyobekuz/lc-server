import asyncHandler from "../../../middleware/asyncHandler.js";
import * as depositService from "../services/deposit.service.js";

const topup = asyncHandler(async (req, res) => {
  const { studentId, ...body } = req.body;
  const data = await depositService.topup(studentId, body, req.user);
  res.status(201).json({ success: true, data, message: "Depozit qo'shildi" });
});

export default topup;
