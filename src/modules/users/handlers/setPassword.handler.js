import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const setPassword = asyncHandler(async (req, res) => {
  const data = await usersService.setPassword(req.params.id, req.body.password);
  res.json({ success: true, data, message: "Parol yangilandi" });
});

export default setPassword;
