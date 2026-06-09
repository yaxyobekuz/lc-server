import asyncHandler from "../../../middleware/asyncHandler.js";
import * as ratingService from "../services/rating.service.js";

export const getRatingSettings = asyncHandler(async (_req, res) => {
  const data = await ratingService.getSettings();
  res.json({ success: true, data });
});

export const updateRatingSettings = asyncHandler(async (req, res) => {
  const data = await ratingService.updateSettings(req.body);
  res.json({ success: true, data, message: "Sozlamalar saqlandi" });
});
