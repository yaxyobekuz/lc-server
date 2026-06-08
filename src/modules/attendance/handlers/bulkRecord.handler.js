import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendance.service.js";
import { ROLES } from "../../../constants/roles.js";

const bulkRecord = asyncHandler(async (req, res) => {
  const source = req.user.role === ROLES.OWNER ? "admin" : "teacher";
  const data = await service.bulkRecord(
    req.params.groupId,
    req.body.date,
    req.body.items,
    req.user,
    source,
    req.body.slot || "",
  );
  res.status(201).json({
    success: true,
    data,
    message: "Davomat saqlandi",
  });
});

export default bulkRecord;
