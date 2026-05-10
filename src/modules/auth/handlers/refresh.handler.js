import asyncHandler from "../../../middleware/asyncHandler.js";
import * as authService from "../services/auth.service.js";
import {
  getRefreshFromCookies,
  setRefreshCookie,
} from "../../../helpers/cookie.helper.js";

const refresh = asyncHandler(async (req, res) => {
  const rawRefresh = getRefreshFromCookies(req);
  const { accessToken, refreshToken, user } = await authService.rotateRefresh({
    rawRefresh,
    userAgent: req.get("user-agent"),
    ip: req.ip,
  });

  setRefreshCookie(res, refreshToken);
  res.json({ success: true, data: { accessToken, user } });
});

export default refresh;
