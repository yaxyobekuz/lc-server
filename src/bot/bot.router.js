import logger from "../config/logger.js";
import { upsertFromTelegram, markBlocked } from "./services/botUser.service.js";
import startHandler from "./handlers/start.handler.js";
import helpHandler from "./handlers/help.handler.js";

const safe = (bot, fn) => async (msg, match) => {
  try {
    await fn(bot, msg, match);
  } catch (err) {
    logger.error({ err, chatId: msg?.chat?.id }, "Bot handler xatosi");
    if (msg?.chat?.id) {
      await bot
        .sendMessage(msg.chat.id, "Kechirasiz, xatolik yuz berdi. Birozdan keyin urinib ko'ring.")
        .catch(() => null);
    }
  }
};

export const registerHandlers = (bot) => {
  bot.onText(/^\/start(?:\s|$)/, safe(bot, startHandler));
  bot.onText(/^\/help(?:\s|$)/, safe(bot, helpHandler));

  bot.on("message", async (msg) => {
    if (!msg?.from) return;
    if (typeof msg.text === "string" && msg.text.startsWith("/")) return;
    try {
      await upsertFromTelegram(msg.from, msg.chat.id);
    } catch (err) {
      logger.error({ err }, "BotUser yangilashda xato");
    }
  });

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Telegram polling xatosi");
  });

  bot.on("webhook_error", (err) => {
    logger.error({ err }, "Telegram webhook xatosi");
  });

  // Foydalanuvchi botni bloklasa, Telegram 403 qaytaradi
  bot.on("error", async (err) => {
    if (err?.response?.statusCode === 403 && err?.response?.body?.from?.id) {
      await markBlocked(err.response.body.from.id, true).catch(() => null);
    }
    logger.error({ err }, "Bot umumiy xato");
  });
};
