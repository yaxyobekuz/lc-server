import asyncHandler from "../../../middleware/asyncHandler.js";
import { buildMeta } from "../../../utils/pagination.js";
import * as salaryAdjustmentService from "../services/salaryAdjustment.service.js";

const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await salaryAdjustmentService.list(req.query);
  res.json({ success: true, data: items, meta: buildMeta({ page, limit, total }) });
});

export default list;
