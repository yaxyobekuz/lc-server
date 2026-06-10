import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ success: true, message: "O'chirildi" });
});

export default remove;
