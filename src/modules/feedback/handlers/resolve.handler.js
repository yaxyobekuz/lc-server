import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/feedback.service.js";

const resolve = asyncHandler(async (req, res) => {
  const data = await service.resolve(req.params.id, req.body, req.user);
  res.json({ success: true, data, message: "Hal qilindi" });
});

export default resolve;
