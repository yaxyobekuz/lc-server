import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendance.service.js";
import { parsePagination } from "../../../utils/pagination.js";

const dashboard = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const data = await service.getDashboardStats({
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    page,
    limit,
  });
  res.json({ success: true, data });
});

export default dashboard;
