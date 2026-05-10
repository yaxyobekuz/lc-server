import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notificationTemplates.service.js";

const getById = asyncHandler(async (req, res) => {
  const data = await service.getById(req.params.id);
  res.json({ success: true, data });
});

export default getById;
