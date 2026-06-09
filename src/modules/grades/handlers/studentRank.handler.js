import asyncHandler from "../../../middleware/asyncHandler.js";
import * as ratingService from "../services/rating.service.js";

const studentRank = asyncHandler(async (req, res) => {
  const data = await ratingService.getStudentRank(req.params.id, {
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
  });
  res.json({ success: true, data });
});

export default studentRank;
