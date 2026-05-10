import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const myHistory = asyncHandler(async (req, res) => {
  const data = await service.getMyHistory(req.user._id, req.query);
  res.json({
    success: true,
    data: data.items,
    meta: { page: data.page, limit: data.limit, total: data.total },
  });
});

export default myHistory;
