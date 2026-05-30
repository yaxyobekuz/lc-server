import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/botAuth.service.js";
import { setRefreshCookie } from "../../../helpers/cookie.helper.js";

const login = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, user } = await service.loginAndLink({
    login: req.body.login,
    password: req.body.password,
    initData: req.body.initData,
    userAgent: req.get("user-agent"),
    ip: req.ip,
  });

  setRefreshCookie(res, refreshToken);
  res.json({
    success: true,
    data: { accessToken, user },
    message: "Tizimga kirildi va Telegram bog'landi",
  });
});

export default login;
