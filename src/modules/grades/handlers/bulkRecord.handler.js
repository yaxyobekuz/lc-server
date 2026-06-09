import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/grades.service.js";

const bulkRecord = asyncHandler(async (req, res) => {
  const data = await service.bulkRecord(
    req.params.groupId,
    req.body.date,
    req.body.items,
    req.user,
    req.body.slot || "",
  );
  res.status(201).json({
    success: true,
    data,
    message: "Baholar saqlandi",
  });
});

export default bulkRecord;
