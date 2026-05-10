import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendanceSettings.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await service.update(req.body);
  res.json({ success: true, data, message: "Sozlamalar saqlandi" });
});

export default update;
