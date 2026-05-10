import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/activityLogs.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.list({
    userId: req.query.userId,
    method: req.query.method,
    resourceType: req.query.resourceType,
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
