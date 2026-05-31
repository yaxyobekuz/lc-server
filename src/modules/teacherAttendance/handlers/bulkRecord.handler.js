import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/teacherAttendance.service.js";

const bulkRecord = asyncHandler(async (req, res) => {
  const data = await service.bulkRecord(req.body.date, req.body.items, req.user);
  res.status(201).json({ success: true, data, message: "Davomat saqlandi" });
});

export default bulkRecord;
