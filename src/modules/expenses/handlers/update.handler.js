import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenses.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await service.update(req.params.id, req.body);
  res.json({ success: true, data, message: "Xarajat yangilandi" });
});

export default update;
