import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const stats = asyncHandler(async (req, res) => {
  const data = await service.stats({
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ success: true, data });
});

export default stats;
