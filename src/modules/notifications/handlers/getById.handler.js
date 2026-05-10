import asyncHandler from "../../../middleware/asyncHandler.js";
import { ROLES } from "../../../constants/roles.js";
import ApiError from "../../../utils/ApiError.js";
import * as service from "../services/notifications.service.js";

const getById = asyncHandler(async (req, res) => {
  const data = await service.getById(req.params.id);
  // Teacher faqat o'zinikini ko'radi
  if (
    req.user.role === ROLES.TEACHER &&
    String(data.sender?._id || data.sender || "") !== String(req.user._id)
  ) {
    throw new ApiError(403, "Ruxsat yo'q");
  }
  res.json({ success: true, data });
});

export default getById;
