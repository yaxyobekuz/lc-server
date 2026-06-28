import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const permanentRemove = asyncHandler(async (req, res) => {
  await usersService.permanentRemove(req.params.id, req.user, {
    confirmName: req.body?.confirmName,
  });
  res.json({ success: true, message: "Butunlay o'chirildi" });
});

export default permanentRemove;
