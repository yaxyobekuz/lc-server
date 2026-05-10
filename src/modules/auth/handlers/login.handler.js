import asyncHandler from "../../../middleware/asyncHandler.js";
import * as authService from "../services/auth.service.js";
import { setRefreshCookie } from "../../../helpers/cookie.helper.js";

const login = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, user } = await authService.login({
    login: req.body.login,
    password: req.body.password,
    userAgent: req.get("user-agent"),
    ip: req.ip,
  });

  setRefreshCookie(res, refreshToken);
  res.json({
    success: true,
    data: { accessToken, user },
    message: "Tizimga xush kelibsiz",
  });
});

export default login;
