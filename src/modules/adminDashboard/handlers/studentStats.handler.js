import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/studentStats.service.js";

const studentStats = asyncHandler(async (req, res) => {
  const data = await service.getStudentStats(req.query);
  res.json({ success: true, data });
});

export default studentStats;
