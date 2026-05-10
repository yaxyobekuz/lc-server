import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/botAuth.service.js";
import { setRefreshCookie } from "../../../helpers/cookie.helper.js";

const verify = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, user } = await service.verifyAndIssue({
    initData: req.body.initData,
    userAgent: req.get("user-agent"),
    ip: req.ip,
  });

  setRefreshCookie(res, refreshToken);
  res.json({
    success: true,
    data: { accessToken, user },
    message: "Telegram orqali muvaffaqiyatli kirildi",
  });
});

export default verify;
