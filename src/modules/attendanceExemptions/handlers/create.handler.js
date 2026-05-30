import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendanceExemptions.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.body, req.user);
  res.status(201).json({
    success: true,
    data,
    message: "Davomatdan ozod davri yaratildi",
  });
});

export default create;
