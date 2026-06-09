import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/systemNotifications.service.js";

const markRead = asyncHandler(async (req, res) => {
  const data = await service.markRead(req.params.id);
  res.json({ success: true, data });
});

export default markRead;
