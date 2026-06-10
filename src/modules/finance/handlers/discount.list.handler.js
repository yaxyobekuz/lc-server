import asyncHandler from "../../../middleware/asyncHandler.js";
import { buildMeta } from "../../../utils/pagination.js";
import * as discountService from "../services/discount.service.js";

const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await discountService.list(req.query);
  res.json({ success: true, data: items, meta: buildMeta({ page, limit, total }) });
});

export default list;
