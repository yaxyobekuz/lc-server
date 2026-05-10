import asyncHandler from "../../../middleware/asyncHandler.js";
import { ROLES } from "../../../constants/roles.js";
import * as service from "../services/salaries.service.js";

const getPayouts = asyncHandler(async (req, res) => {
  if (req.user.role === ROLES.TEACHER) {
    await service.ensureTeacherOwns(req.params.id, req.user._id);
  }
  const data = await service.getPayouts(req.params.id);
  res.json({ success: true, data });
});

export default getPayouts;
