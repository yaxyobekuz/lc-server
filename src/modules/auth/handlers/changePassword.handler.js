import asyncHandler from "../../../middleware/asyncHandler.js";
import * as authService from "../services/auth.service.js";

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user, req.body);
  res.json({
    success: true,
    message: "Parol o'zgartirildi",
  });
});

export default changePassword;
