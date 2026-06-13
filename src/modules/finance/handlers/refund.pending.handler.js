import asyncHandler from "../../../middleware/asyncHandler.js";
import { buildMeta } from "../../../utils/pagination.js";
import * as refundService from "../services/refund.service.js";

const pending = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await refundService.listPending(req.query);
  res.json({ success: true, data: items, meta: buildMeta({ page, limit, total }) });
});

export default pending;
