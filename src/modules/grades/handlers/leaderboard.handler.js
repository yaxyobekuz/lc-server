import asyncHandler from "../../../middleware/asyncHandler.js";
import * as ratingService from "../services/rating.service.js";

const leaderboard = asyncHandler(async (req, res) => {
  const data = await ratingService.getLeaderboard({
    scope: req.query.scope || "all",
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    limit: req.query.limit ? Number(req.query.limit) : 100,
  });
  res.json({ success: true, data });
});

export default leaderboard;
