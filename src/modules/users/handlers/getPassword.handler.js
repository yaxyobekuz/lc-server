import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const getPassword = asyncHandler(async (req, res) => {
  const data = await usersService.getPassword(req.params.id);
  res.json({ success: true, data });
});

export default getPassword;
