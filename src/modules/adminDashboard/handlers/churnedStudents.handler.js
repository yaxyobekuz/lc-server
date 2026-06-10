import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/retention.service.js";

const churnedStudents = asyncHandler(async (req, res) => {
  const data = await service.getChurnedStudents(req.query);
  res.json({ success: true, data });
});

export default churnedStudents;
