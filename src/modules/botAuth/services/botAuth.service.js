import BotUser from "../../../models/botUser.model.js";
import ApiError from "../../../utils/ApiError.js";
import env from "../../../config/env.js";
import { verifyInitData } from "../../../bot/utils/initData.js";
import {
  issueTokens,
  sanitizeUser,
} from "../../auth/services/auth.service.js";

export const verifyAndIssue = async ({ initData, userAgent, ip }) => {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new ApiError(503, "Bot konfiguratsiyalanmagan");
  }

  const result = verifyInitData(initData, env.TELEGRAM_BOT_TOKEN);
  if (!result.ok) {
    if (result.reason === "expired") {
      throw new ApiError(401, "Sessiya muddati tugagan, qayta oching");
    }
    throw new ApiError(401, "Telegram ma'lumotlari tasdiqlanmadi");
  }

  const tgUser = result.user;
  const botUser = await BotUser.findOne({ telegramId: tgUser.id }).populate(
    "user",
  );
  if (!botUser || !botUser.user) {
    throw new ApiError(
      404,
      "Hisob bog'lanmagan. Avval botda /start ni bosing va telefon raqamingizni yuboring",
    );
  }
  if (!botUser.user.isActive) {
    throw new ApiError(401, "Hisob faol emas");
  }

  const { accessToken, refreshToken } = await issueTokens(botUser.user, {
    userAgent,
    ip,
  });
  return {
    accessToken,
    refreshToken,
    user: sanitizeUser(botUser.user),
  };
};
