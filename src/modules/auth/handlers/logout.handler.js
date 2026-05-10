import asyncHandler from "../../../middleware/asyncHandler.js";
import * as authService from "../services/auth.service.js";
import {
  getRefreshFromCookies,
  clearRefreshCookie,
} from "../../../helpers/cookie.helper.js";

const logout = asyncHandler(async (req, res) => {
  const rawRefresh = getRefreshFromCookies(req);
  await authService.logout({ rawRefresh });
  clearRefreshCookie(res);
  res.json({ success: true, message: "Tizimdan chiqdingiz" });
});

export default logout;
