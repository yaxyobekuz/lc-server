import BotUser from "../../../models/botUser.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import env from "../../../config/env.js";
import logger from "../../../config/logger.js";
import { verifyInitData } from "../../../bot/utils/initData.js";
import { comparePassword } from "../../../helpers/password.helper.js";
import { normalizePhone, isPhoneLike } from "../../../utils/phone.js";
import {
  issueTokens,
  sanitizeUser,
} from "../../auth/services/auth.service.js";

// initData ni tekshiradi va Telegram foydalanuvchisini qaytaradi
const requireTgUser = (initData) => {
  const tokens = [env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_BOT_TOKEN_2].filter(Boolean);
  if (tokens.length === 0) {
    throw new ApiError(503, "Bot konfiguratsiyalanmagan");
  }
  const result = verifyInitData(initData, tokens);
  if (!result.ok) {
    // Diagnostika: bad-hash bo'lsa xom initData'ni (qisqartirib) loglaymiz - keyin olib tashlanadi.
    logger.warn({ reason: result.reason }, "Telegram initData verify failed");
    if (result.reason === "expired") {
      throw new ApiError(401, "Sessiya muddati tugagan, qayta oching");
    }
    throw new ApiError(401, "Telegram ma'lumotlari tasdiqlanmadi");
  }
  return result.user;
};

// initData dan Telegram foydalanuvchisini HMAC tekshiruvisiz ajratadi.
// Faqat loginAndLink (parol allaqachon tasdiqlangan) uchun fallback.
const parseTgUserLoose = (initData) => {
  try {
    const p = new URLSearchParams(initData);
    const u = JSON.parse(p.get("user") || "null");
    return u && u.id ? u : null;
  } catch {
    return null;
  }
};

// Telegram ID ni User akkauntiga bog'laydi (BotUser bo'lmasa yaratadi)
const linkTelegram = async (tgUser, userId) => {
  // Bitta akkaunt faqat bitta Telegramga bog'lansin - eski bog'lanishni uzamiz
  await BotUser.updateMany(
    { user: userId, telegramId: { $ne: tgUser.id } },
    { $set: { user: null } },
  );

  await BotUser.findOneAndUpdate(
    { telegramId: tgUser.id },
    {
      $set: {
        username: tgUser.username ? String(tgUser.username).toLowerCase() : null,
        firstName: tgUser.first_name || "",
        lastName: tgUser.last_name || "",
        languageCode: tgUser.language_code || "uz",
        user: userId,
      },
      $setOnInsert: { telegramId: tgUser.id, chatId: tgUser.id },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

export const verifyAndIssue = async ({ initData, userAgent, ip }) => {
  const tgUser = requireTgUser(initData);
  const botUser = await BotUser.findOne({ telegramId: tgUser.id }).populate(
    "user",
  );
  if (!botUser || !botUser.user) {
    throw new ApiError(
      404,
      "Hisob bog'lanmagan. Login va parol bilan kirib, akkauntingizni bog'lang",
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

// Telefon/login + parol bilan kirish va Telegram ID ni avtomatik bog'lash
export const loginAndLink = async ({ login, password, initData, userAgent, ip }) => {
  // Avval PAROLni tekshiramiz - asosiy himoya shu.
  const trimmed = String(login || "").trim();
  if (!trimmed) throw new ApiError(400, "Login kerak");

  const phone = isPhoneLike(trimmed) ? normalizePhone(trimmed) : null;
  const filters = [{ username: trimmed.toLowerCase() }];
  if (phone) filters.push({ phone });

  const user = await User.findOne({ $or: filters }).select("+passwordHash");
  if (!user || !user.isActive) {
    throw new ApiError(401, "Login yoki parol noto'g'ri");
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) throw new ApiError(401, "Login yoki parol noto'g'ri");

  // Telegram bog'lash: qat'iy HMAC ni sinaymiz; o'tmasa ham PAROL tasdiqlangani uchun
  // initData dagi telegram id ni baribir bog'laymiz (qaysi botdan ochilsa ham ishlaydi).
  if (!env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_BOT_TOKEN_2) {
    throw new ApiError(503, "Bot konfiguratsiyalanmagan");
  }
  const tokens = [env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_BOT_TOKEN_2].filter(Boolean);
  const verified = verifyInitData(initData, tokens);
  const tgUser = verified.ok ? verified.user : parseTgUserLoose(initData);
  if (!tgUser) {
    throw new ApiError(401, "Telegram ma'lumotlari topilmadi");
  }
  if (!verified.ok) {
    logger.warn(
      { reason: verified.reason, userId: String(user._id) },
      "initData HMAC o'tmadi - parol asosida bog'lanmoqda (fallback)",
    );
  }

  await linkTelegram(tgUser, user._id);

  const { accessToken, refreshToken } = await issueTokens(user, {
    userAgent,
    ip,
  });
  return { accessToken, refreshToken, user: sanitizeUser(user) };
};
