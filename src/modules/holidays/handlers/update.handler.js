import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/holidays.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await service.update(req.params.id, req.body);
  res.json({ success: true, data, message: "Bayram yangilandi" });
});

export default update;
