import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenses.service.js";

const restore = asyncHandler(async (req, res) => {
  const data = await service.restore(req.params.id);
  res.json({ success: true, data, message: "Xarajat tiklandi" });
});

export default restore;
