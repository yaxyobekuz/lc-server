import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/holidays.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.list({
    search: req.query.search,
    audience: req.query.audience,
    includeInactive: req.query.includeInactive,
    includePast: req.query.includePast,
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
