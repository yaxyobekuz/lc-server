import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenses.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user);
  res.json({ success: true, message: "Xarajat arxivlandi" });
});

export default remove;
