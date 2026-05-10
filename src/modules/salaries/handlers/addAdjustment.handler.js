import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const addAdjustment = asyncHandler(async (req, res) => {
  const data = await service.addAdjustment(req.params.id, req.body, req.user);
  res.status(201).json({
    success: true,
    data,
    message: "O'zgartirish qo'shildi",
  });
});

export default addAdjustment;
