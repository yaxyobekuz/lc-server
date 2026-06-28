import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const remove = asyncHandler(async (req, res) => {
  await usersService.softRemove(req.params.id, {
    reasonId: req.body?.reasonId,
    archiveDate: req.body?.archiveDate,
    by: req.user,
  });
  res.json({ success: true, message: "O'chirildi" });
});

export default remove;
