import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/auth.service.js";
import { setRefreshCookie } from "../../../helpers/cookie.helper.js";

const login = asyncHandler(async (req, res) => {
  const meta = { userAgent: req.headers["user-agent"], ip: req.ip };
  const { user, accessToken, refreshToken, permissions } = await service.login(req.body, meta);

  setRefreshCookie(res, refreshToken);
  res.json({
    success: true,
    message: "Tizimga muvaffaqiyatli kirildi",
    data: { user, accessToken, permissions },
  });
});

export default login;
