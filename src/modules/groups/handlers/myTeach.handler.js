import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";

const myTeach = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.TEACHER) {
    throw new ApiError(403, "Faqat o'qituvchilar uchun");
  }
  const items = await groupsService.listForTeacher(req.user._id);
  res.json({ success: true, data: items });
});

export default myTeach;
