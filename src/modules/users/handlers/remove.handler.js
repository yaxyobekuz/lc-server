import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const remove = asyncHandler(async (req, res) => {
  await usersService.softRemove(req.params.id);
  res.json({ success: true, message: "O'chirildi" });
});

export default remove;
