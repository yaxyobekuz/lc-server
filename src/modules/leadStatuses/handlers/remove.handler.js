import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leadStatuses.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await service.softRemove(req.params.id);
  res.json({ success: true, data, message: "Status o'chirildi" });
});

export default remove;
