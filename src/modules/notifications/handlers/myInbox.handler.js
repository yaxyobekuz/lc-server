import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notifications.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const myInbox = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.getMyInbox(req.user._id, {
    page,
    limit,
    unreadOnly: req.query.unreadOnly,
  });
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default myInbox;
