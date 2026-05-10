import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/feedback.service.js";

const reply = asyncHandler(async (req, res) => {
  const data = await service.reply(req.params.id, req.body, req.user);
  res.json({ success: true, data, message: "Javob saqlandi" });
});

export default reply;
