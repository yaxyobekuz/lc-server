import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await groupsService.remove(req.params.id, {
    archivedAt: req.body?.archivedAt,
  });
  res.json({ success: true, data, message: "Guruh arxivlandi" });
});

export default remove;
