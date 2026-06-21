import asyncHandler from "../../../middleware/asyncHandler.js";
import { buildMeta } from "../../../utils/pagination.js";
import * as depositService from "../services/deposit.service.js";

const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await depositService.list(req.query);
  res.json({ success: true, data: items, meta: buildMeta({ page, limit, total }) });
});

export default list;
