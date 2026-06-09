import asyncHandler from "../../../middleware/asyncHandler.js";
import * as searchService from "../services/search.service.js";

const search = asyncHandler(async (req, res) => {
  const data = await searchService.globalSearch(req.query.q, {
    limit: req.query.limit ? Number(req.query.limit) : 5,
  });
  res.json({ success: true, data });
});

export default search;
