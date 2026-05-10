import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/feedback.service.js";

const review = asyncHandler(async (req, res) => {
  const data = await service.markReviewed(req.params.id, req.user);
  res.json({ success: true, data, message: "Ko'rib chiqishga o'tkazildi" });
});

export default review;
