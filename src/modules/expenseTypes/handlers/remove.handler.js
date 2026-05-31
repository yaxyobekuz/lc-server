import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseTypes.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.softRemove(req.params.id);
  res.json({ success: true, message: "Xarajat turi arxivlandi" });
});

export default remove;
