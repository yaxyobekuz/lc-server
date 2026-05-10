import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/feedback.service.js";

const getById = asyncHandler(async (req, res) => {
  const data = await service.getById(req.params.id);
  service.ensureOwnerOrAuthor(data, req.user);
  res.json({ success: true, data });
});

export default getById;
