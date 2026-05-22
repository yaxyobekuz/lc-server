import asyncHandler from "../../../middleware/asyncHandler.js";
import * as authService from "../services/auth.service.js";

const updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user, req.body);
  res.json({
    success: true,
    data: user,
    message: "Profil yangilandi",
  });
});

export default updateProfile;
