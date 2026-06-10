import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.list({
    status: req.query.status,
    source: req.query.source,
    direction: req.query.direction,
    search: req.query.search,
    from: req.query.from,
    to: req.query.to,
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
