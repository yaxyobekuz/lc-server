import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leadOptions.service.js";

const list = asyncHandler(async (req, res) => {
  const { items, total } = await service.list({
    kind: req.query.kind,
    search: req.query.search,
    includeInactive: req.query.includeInactive,
  });
  res.json({ success: true, data: items, meta: { total } });
});

export default list;
