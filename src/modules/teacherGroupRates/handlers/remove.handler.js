import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/teacherGroupRates.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await service.remove(req.params.id);
  res.json({ success: true, data, message: "Stavka o'chirildi" });
});

export default remove;
