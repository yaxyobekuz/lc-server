import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenses.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.list({
    type: req.query.type,
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    archived: req.query.archived === "1" || req.query.archived === "true",
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
