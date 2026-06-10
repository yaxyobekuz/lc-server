import BotUser from "../../models/botUser.model.js";
import logger from "../../config/logger.js";
import { getBot } from "../config/bot.instance.js";
import { markBlocked } from "./botUser.service.js";

const CATEGORY_EMOJI = {
  payment_reminder: "💰",
  debt_warning: "⚠️",
  class_cancel: "❌",
  announcement: "📢",
  admin_personal: "✉️",
  teacher_message: "👨‍🏫",
  feedback_status: "📝",
  holiday: "🎉",
  attendance: "📋",
  template_based: "📨",
  other: "📨",
};

const formatMessage = ({ title, body, category }) => {
  const emoji = CATEGORY_EMOJI[category] || CATEGORY_EMOJI.other;
  if (title && title.trim()) {
    return `${emoji} ${title}\n\n${body}`;
  }
  return `${emoji} ${body}`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Telegram bloklash/deaktivatsiya xatosimi (qayta urinmaymiz, foydalanuvchini bloklaymiz)
const isBlockedError = (err) => {
  const status = err?.response?.statusCode;
  const desc = String(err?.response?.body?.description || err?.message || "");
  return (
    status === 403 ||
    /bot was blocked|user is deactivated|chat not found|bot can't initiate/i.test(
      desc,
    )
  );
};

const retryAfterOf = (err) =>
  Number(err?.response?.body?.parameters?.retry_after) || 0;

const reasonOf = (err) =>
  err?.response?.body?.description || err?.message || "send-failed";

// Bitta chatId ga yetkazish. telegramId berilsa, blok holatida foydalanuvchini belgilaydi.
// Qaytadi: { ok, reason?, transient? } - transient=true bo'lsa terminal sifatida saqlanmaydi.
export const deliverToChat = async ({ chatId, telegramId }, payload) => {
  const bot = getBot();
  if (!bot) return { ok: false, reason: "bot-not-running", transient: true };
  const text = formatMessage(payload);

  try {
    await bot.sendMessage(chatId, text);
    return { ok: true };
  } catch (err) {
    // 429 - rate limit: retry_after kutib bir marta qayta urinamiz
    if (err?.response?.statusCode === 429) {
      const wait = Math.min((retryAfterOf(err) || 1) * 1000, 5000);
      await sleep(wait);
      try {
        await bot.sendMessage(chatId, text);
        return { ok: true };
      } catch (err2) {
        if (isBlockedError(err2)) {
          if (telegramId) await markBlocked(telegramId, true).catch(() => null);
          return { ok: false, reason: "blocked" };
        }
        return { ok: false, reason: reasonOf(err2), transient: true };
      }
    }
    if (isBlockedError(err)) {
      if (telegramId) await markBlocked(telegramId, true).catch(() => null);
      logger.info({ telegramId }, "Foydalanuvchi botni bloklagan");
      return { ok: false, reason: "blocked" };
    }
    logger.warn({ err, chatId }, "Notification yetkazib bo'lmadi");
    return { ok: false, reason: reasonOf(err) };
  }
};

// Bitta foydalanuvchiga (userId) yetkazish - bog'langan BotUser orqali
export const deliverToUser = async (userId, payload) => {
  if (!userId) return { ok: false, reason: "no-bot-link" };
  const bu = await BotUser.findOne({ user: userId }).lean();
  if (!bu || bu.isBlocked || !bu.chatId) return { ok: false, reason: "no-bot-link" };
  return deliverToChat({ chatId: bu.chatId, telegramId: bu.telegramId }, payload);
};
