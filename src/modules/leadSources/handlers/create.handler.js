import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leadSources.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.body);
  res.status(201).json({
    success: true,
    data,
    message: "Lead manba yaratildi",
  });
});

export default create;
