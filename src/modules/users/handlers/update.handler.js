import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const update = asyncHandler(async (req, res) => {
  const user = await usersService.update(req.params.id, req.body);
  res.json({ success: true, data: user, message: "Saqlandi" });
});

export default update;
