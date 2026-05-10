import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/feedback.service.js";

const reject = asyncHandler(async (req, res) => {
  const data = await service.reject(req.params.id, req.body, req.user);
  res.json({ success: true, data, message: "Rad etildi" });
});

export default reject;
