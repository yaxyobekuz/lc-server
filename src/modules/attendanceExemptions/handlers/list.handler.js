import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/attendanceExemptions.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.list(
    {
      studentId: req.query.studentId,
      isActive: req.query.isActive,
      page,
      limit,
    },
    req.user,
  );
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default list;
