import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const remove = asyncHandler(async (req, res) => {
  await groupsService.remove(req.params.id);
  res.json({ success: true, message: "Guruh o'chirildi" });
});

export default remove;
