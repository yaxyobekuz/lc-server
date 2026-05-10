import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notifications.service.js";

const send = asyncHandler(async (req, res) => {
  const data = await service.send(req.body, req.user);
  res
    .status(201)
    .json({ success: true, data, message: "Xabar yuborildi" });
});

export default send;
