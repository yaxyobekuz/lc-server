import asyncHandler from "../../../middleware/asyncHandler.js";
import * as authService from "../services/auth.service.js";

const registerUser = asyncHandler(async (req, res) => {
  const user = await authService.registerUser(req.body);
  res.status(201).json({
    success: true,
    data: user,
    message: "Foydalanuvchi yaratildi",
  });
});

export default registerUser;
