import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/feedback.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const myFeedback = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.getMyFeedback(req.user._id, {
    page,
    limit,
  });
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default myFeedback;
