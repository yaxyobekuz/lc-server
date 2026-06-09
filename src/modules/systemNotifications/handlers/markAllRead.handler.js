import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/systemNotifications.service.js";

const markAllRead = asyncHandler(async (_req, res) => {
  const data = await service.markAllRead();
  res.json({ success: true, data, message: "Hammasi o'qildi" });
});

export default markAllRead;
