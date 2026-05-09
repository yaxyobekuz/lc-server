import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/auth.service.js";
import {
  getRefreshFromCookies,
  clearRefreshCookie,
} from "../../../helpers/cookie.helper.js";

const logout = asyncHandler(async (req, res) => {
  const token = getRefreshFromCookies(req);
  await service.logout(token);
  clearRefreshCookie(res);
  res.json({ success: true, message: "Tizimdan chiqildi" });
});

export default logout;
