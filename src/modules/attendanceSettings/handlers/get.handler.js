import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendanceSettings.service.js";

const get = asyncHandler(async (_req, res) => {
  const data = await service.get();
  res.json({ success: true, data });
});

export default get;
