import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/archiveReasons.service.js";

const report = asyncHandler(async (req, res) => {
  const data = await service.report({
    from: req.query.from,
    to: req.query.to,
    action: req.query.action,
  });
  res.json({ success: true, data });
});

export default report;
