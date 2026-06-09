import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notifications.service.js";

// Rejalashtirilgan (hali yuborilmagan) xabarni bekor qiladi.
const cancel = asyncHandler(async (req, res) => {
  const data = await service.cancelScheduled(req.params.id);
  res.json({ success: true, data, message: "Reja bekor qilindi" });
});

export default cancel;
