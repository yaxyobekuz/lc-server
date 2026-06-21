import asyncHandler from "../../../middleware/asyncHandler.js";
import * as depositService from "../services/deposit.service.js";

const history = asyncHandler(async (req, res) => {
  const data = await depositService.historyFor(req.params.studentId);
  res.json({ success: true, data });
});

export default history;
