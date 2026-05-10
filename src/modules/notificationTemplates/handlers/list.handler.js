import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/notificationTemplates.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.list({
    search: req.query.search,
    category: req.query.category,
    includeInactive: req.query.includeInactive,
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
