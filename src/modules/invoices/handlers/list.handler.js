import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/invoices.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.list({
    studentId: req.query.studentId,
    groupId: req.query.groupId,
    year: req.query.year,
    month: req.query.month,
    status: req.query.status,
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
