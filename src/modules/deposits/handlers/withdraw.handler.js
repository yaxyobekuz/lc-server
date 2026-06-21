import asyncHandler from "../../../middleware/asyncHandler.js";
import * as depositService from "../services/deposit.service.js";

const withdraw = asyncHandler(async (req, res) => {
  const { studentId, ...body } = req.body;
  const data = await depositService.withdraw(studentId, body, req.user);
  res.json({ success: true, data, message: "Depozitdan yechib olindi" });
});

export default withdraw;
