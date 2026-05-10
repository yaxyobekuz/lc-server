import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const recordPayout = asyncHandler(async (req, res) => {
  const data = await service.recordPayout(req.params.id, req.body, req.user);
  res.status(201).json({
    success: true,
    data,
    message: "To'lov yozildi",
  });
});

export default recordPayout;
