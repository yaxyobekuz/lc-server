import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notifications.service.js";

const unreadCount = asyncHandler(async (req, res) => {
  const count = await service.getUnreadCount(req.user._id);
  res.json({ success: true, data: { count } });
});

export default unreadCount;
