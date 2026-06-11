import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendanceExemptions.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user);
  res.json({ success: true, message: "Davomatdan ozod davri o'chirildi" });
});

export default remove;
