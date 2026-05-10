import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notifications.service.js";

const markRead = asyncHandler(async (req, res) => {
  await service.markRead(req.params.id, req.user._id);
  res.json({ success: true, message: "O'qildi" });
});

export default markRead;
