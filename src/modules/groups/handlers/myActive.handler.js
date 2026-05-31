import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";

const myActive = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.STUDENT) {
    throw new ApiError(403, "Faqat o'quvchilar uchun");
  }
  const data = await groupsService.findActiveForStudent(req.user._id);
  res.json({ success: true, data });
});

export default myActive;
