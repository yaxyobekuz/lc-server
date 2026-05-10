import asyncHandler from "../../../middleware/asyncHandler.js";
import { ROLES } from "../../../constants/roles.js";
import ApiError from "../../../utils/ApiError.js";
import * as service from "../services/notifications.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const getRecipients = asyncHandler(async (req, res) => {
  // Teacher uchun ownership check
  if (req.user.role === ROLES.TEACHER) {
    const notif = await service.getById(req.params.id);
    if (String(notif.sender?._id || notif.sender) !== String(req.user._id)) {
      throw new ApiError(403, "Ruxsat yo'q");
    }
  }
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.getRecipientList(req.params.id, {
    page,
    limit,
  });
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default getRecipients;
