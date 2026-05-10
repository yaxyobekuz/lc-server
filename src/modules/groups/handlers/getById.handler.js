import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const getById = asyncHandler(async (req, res) => {
  const data = await groupsService.getById(req.params.id);
  res.json({ success: true, data });
});

export default getById;
