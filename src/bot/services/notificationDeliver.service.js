import BotUser from "../../models/botUser.model.js";
import logger from "../../config/logger.js";
import { getBot } from "../config/bot.instance.js";

const CATEGORY_EMOJI = {
  payment_reminder: "💰",
  debt_warning: "⚠️",
  class_cancel: "❌",
  announcement: "📢",
  admin_personal: "✉️",
  teacher_message: "👨‍🏫",
  feedback_status: "📝",
  holiday: "🎉",
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

const findChatId = async (userId) => {
  if (!userId) return null;
  const bu = await BotUser.findOne({ user: userId });
  if (!bu || bu.isBlocked) return null;
  return bu.chatId;
};

// Returns { ok, reason? }
export const deliverToUser = async (userId, payload) => {
  const chatId = await findChatId(userId);
  if (!chatId) return { ok: false, reason: "no-bot-link" };

  const bot = getBot();
  if (!bot) return { ok: false, reason: "bot-not-running" };

  const text = formatMessage(payload);

  try {
    await bot.sendMessage(chatId, text);
    return { ok: true };
  } catch (err) {
    const reason = err?.response?.body?.description || err?.message || "send-failed";
    logger.warn({ err, chatId, userId }, "Notification yetkazib bo'lmadi");
    return { ok: false, reason };
  }
};
