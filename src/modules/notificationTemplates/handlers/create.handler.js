import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notificationTemplates.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.body);
  res.status(201).json({ success: true, data, message: "Shablon yaratildi" });
});

export default create;
