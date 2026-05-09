import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/auth.service.js";
import {
  getRefreshFromCookies,
  setRefreshCookie,
} from "../../../helpers/cookie.helper.js";

const refresh = asyncHandler(async (req, res) => {
  const incoming = getRefreshFromCookies(req);
  const meta = { userAgent: req.headers["user-agent"], ip: req.ip };
  const { user, accessToken, refreshToken } = await service.refresh(incoming, meta);

  setRefreshCookie(res, refreshToken);
  res.json({ success: true, data: { user, accessToken } });
});

export default refresh;
