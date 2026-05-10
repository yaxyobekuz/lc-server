import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const getById = asyncHandler(async (req, res) => {
  const profile = await usersService.getProfile(req.params.id);
  res.json({ success: true, data: profile });
});

export default getById;
