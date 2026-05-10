import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await groupsService.update(req.params.id, req.body);
  res.json({ success: true, data, message: "Saqlandi" });
});

export default update;
