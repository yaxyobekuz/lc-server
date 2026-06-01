import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const restore = asyncHandler(async (req, res) => {
  const data = await groupsService.restore(req.params.id);
  res.json({ success: true, data, message: "Guruh tiklandi" });
});

export default restore;
