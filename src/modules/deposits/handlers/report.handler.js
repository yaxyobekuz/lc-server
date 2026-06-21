import asyncHandler from "../../../middleware/asyncHandler.js";
import * as depositService from "../services/deposit.service.js";

const report = asyncHandler(async (req, res) => {
  const data = await depositService.report(req.query);
  res.json({ success: true, data });
});

export default report;
