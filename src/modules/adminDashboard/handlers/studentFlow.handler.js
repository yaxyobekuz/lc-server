import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/adminDashboard.service.js";

const studentFlow = asyncHandler(async (req, res) => {
  const data = await service.getStudentFlow(req.query);
  res.json({ success: true, data });
});

export default studentFlow;
