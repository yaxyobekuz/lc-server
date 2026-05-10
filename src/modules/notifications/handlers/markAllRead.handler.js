import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notifications.service.js";

const markAllRead = asyncHandler(async (req, res) => {
  const data = await service.markAllRead(req.user._id);
  res.json({ success: true, data, message: "Hammasi o'qildi" });
});

export default markAllRead;
