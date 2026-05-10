import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await groupsService.create(req.body);
  res.status(201).json({
    success: true,
    data,
    message: "Guruh yaratildi",
  });
});

export default create;
