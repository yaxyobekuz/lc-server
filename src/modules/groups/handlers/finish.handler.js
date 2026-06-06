import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const finish = asyncHandler(async (req, res) => {
  const data = await groupsService.finish(req.params.id, {
    finishedAt: req.body?.finishedAt,
  });
  res.json({ success: true, data, message: "Kurs yakunlandi" });
});

export default finish;
