import asyncHandler from "../../../middleware/asyncHandler.js";
import * as depositService from "../services/deposit.service.js";

const balance = asyncHandler(async (req, res) => {
  const data = await depositService.summaryFor(req.params.studentId);
  res.json({ success: true, data });
});

export default balance;
