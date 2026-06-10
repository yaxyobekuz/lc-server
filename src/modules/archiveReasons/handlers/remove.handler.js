import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/archiveReasons.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.softRemove(req.params.id);
  res.json({ success: true, message: "O'chirildi" });
});

export default remove;
