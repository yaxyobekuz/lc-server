import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";

// O'quvchi "siz guruhdan chiqarildingiz" modalini yopganda chaqiriladi -
// xabar qayta ko'rinmasligi uchun ko'rilgan deb belgilanadi.
const markRemovalNoticeSeen = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.STUDENT) {
    throw new ApiError(403, "Faqat o'quvchilar uchun");
  }
  await groupsService.markRemovalNoticesSeen(req.user._id);
  res.json({ success: true });
});

export default markRemovalNoticeSeen;
