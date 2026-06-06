import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const undelete = asyncHandler(async (req, res) => {
  const data = await groupsService.restoreDeleted(req.params.id);
  res.json({ success: true, data, message: "Guruh qaytarildi" });
});

export default undelete;
