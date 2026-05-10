import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const groupHistory = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await usersService.studentHistory(req.params.id, {
    page,
    limit,
  });
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default groupHistory;
