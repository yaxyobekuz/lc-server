import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/financeReport.service.js";

const ledger = asyncHandler(async (req, res) => {
  const data = await service.getLedger(req.query);
  res.json({ success: true, data });
});

export default ledger;
