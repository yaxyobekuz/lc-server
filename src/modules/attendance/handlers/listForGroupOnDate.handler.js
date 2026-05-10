import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendance.service.js";

const listForGroupOnDate = asyncHandler(async (req, res) => {
  const data = await service.listForGroupOnDate(
    req.params.groupId,
    req.query.date,
  );
  res.json({ success: true, data });
});

export default listForGroupOnDate;
