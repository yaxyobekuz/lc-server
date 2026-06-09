import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notifications.service.js";

// Tanlangan auditoriya bo'yicha nechta oluvchi chiqishini qaytaradi (jonli preview).
const preview = asyncHandler(async (req, res) => {
  const data = await service.previewAudience(req.body.audience, req.user);
  res.json({ success: true, data });
});

export default preview;
