import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/systemNotifications.service.js";

const unreadCount = asyncHandler(async (_req, res) => {
  const count = await service.getUnreadCount();
  res.json({ success: true, data: { count } });
});

export default unreadCount;
