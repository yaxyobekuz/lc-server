import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const permanentRemove = asyncHandler(async (req, res) => {
  await groupsService.permanentRemove(req.params.id, req.user, {
    confirmName: req.body?.confirmName,
  });
  res.json({ success: true, message: "Guruh butunlay o'chirildi" });
});

export default permanentRemove;
