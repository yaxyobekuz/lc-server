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
    logger.warn({ reason: result.reason, debug: result.debug }, "Telegram initData verify failed");
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

// Eskirgan unique indekslarni o'chiradi (DB'da qolib ketgan bo'lsa):
//   - user_1        : bitta user faqat bitta Telegramga (endi shart emas)
//   - telegramId_1  : bitta telegram faqat bitta userga (endi shart emas)
// Mongoose autoIndex eski indeksni hech qachon o'chirmaydi - shuning uchun
// E11000 bo'lganda shu yerda bir marta o'zimiz olib tashlaymiz.
const dropStaleUserIndex = async () => {
  for (const name of ["user_1", "telegramId_1"]) {
    try {
      await BotUser.collection.dropIndex(name);
      logger.warn({ index: name }, "Eskirgan unique indeks o'chirildi (avto-tuzatish)");
    } catch {
      /* indeks yo'q yoki allaqachon o'chirilgan - e'tiborsiz */
    }
  }
};

// Telegram ID ni User akkauntiga bog'laydi.
// KO'P-AKKAUNT: bitta Telegram bir nechta userga bog'lanaversin - eski bog'lanishni
// UZMAYMIZ. Bog'lanish (telegramId, user) JUFTLIGI bo'yicha:
//   - shu juftlik bor bo'lsa  -> yangilaydi (dublikat yaratmaydi)
//   - juftlik yo'q bo'lsa      -> YANGI BotUser hujjati yaratadi (bir xil tgId, boshqa user)
// Shuning uchun bir TG ID ko'p userga bemalol birikadi, E11000 chiqmaydi.
const linkTelegram = async (tgUser, userId) => {
  const run = async () => {
    await BotUser.findOneAndUpdate(
      { telegramId: tgUser.id, user: userId },
      {
        $set: {
          chatId: tgUser.id,
          username: tgUser.username ? String(tgUser.username).toLowerCase() : null,
          firstName: tgUser.first_name || "",
          lastName: tgUser.last_name || "",
          languageCode: tgUser.language_code || "uz",
          user: userId,
        },
        $setOnInsert: { telegramId: tgUser.id },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  };

  try {
    await run();
  } catch (err) {
    // E11000 = eskirgan unique indeks (telegramId_1 yoki user_1). O'chirib qayta urinamiz.
    if (err?.code === 11000) {
      logger.warn({ err: err?.message }, "linkTelegram E11000 - eskirgan indeks o'chirilib qayta urinilmoqda");
      await dropStaleUserIndex();
      await run();
    } else {
      throw err;
    }
  }
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
      { reason: verified.reason, userId: String(user._id), debug: verified.debug },
      "initData HMAC o'tmadi - parol asosida bog'lanmoqda (fallback)",
    );
  }

  // Bog'lash muvaffaqiyatsiz bo'lsa ham (DB xatosi/E11000) PAROL to'g'ri bo'lgani uchun
  // login to'xtamasin - foydalanuvchi kirsin, xatoni logga yozamiz.
  try {
    await linkTelegram(tgUser, user._id);
  } catch (err) {
    logger.error(
      { err: err?.message, code: err?.code, userId: String(user._id), tgId: tgUser.id },
      "Telegram bog'lashda xato (login baribir davom etadi)",
    );
  }

  const { accessToken, refreshToken } = await issueTokens(user, {
    userAgent,
    ip,
  });
  return { accessToken, refreshToken, user: sanitizeUser(user) };
};
