import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leadOptions.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await service.update(req.params.id, req.body);
  res.json({ success: true, data, message: "Saqlandi" });
});

export default update;
