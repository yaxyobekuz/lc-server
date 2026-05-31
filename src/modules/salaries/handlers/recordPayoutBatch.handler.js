import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const recordPayoutBatch = asyncHandler(async (req, res) => {
  const data = await service.recordPayoutBatch(
    req.body.salaryIds,
    req.body,
    req.user,
  );
  res.status(201).json({
    success: true,
    data,
    message: "To'lovlar yozildi",
  });
});

export default recordPayoutBatch;
