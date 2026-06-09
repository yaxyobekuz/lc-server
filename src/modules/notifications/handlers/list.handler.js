import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notifications.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";
import { ROLES } from "../../../constants/roles.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  // Teacher faqat o'z yuborilgan xabarlarini ko'radi
  const senderId =
    req.user.role === ROLES.TEACHER ? req.user._id : req.query.senderId;

  const { items, total } = await service.list({
    senderId,
    category: req.query.category,
    channel: req.query.channel,
    status: req.query.status,
    search: req.query.search,
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    page,
    limit,
  });
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default list;
