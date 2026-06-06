import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const undelete = asyncHandler(async (req, res) => {
  const data = await usersService.restoreDeleted(req.params.id);
  res.json({ success: true, data, message: "Qaytarildi" });
});

export default undelete;
