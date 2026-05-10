import logger from "../config/logger.js";
import { upsertFromTelegram, markBlocked } from "./services/botUser.service.js";
import startHandler from "./handlers/start.handler.js";
import helpHandler from "./handlers/help.handler.js";
import contactHandler from "./handlers/contact.handler.js";
import myGroupsHandler from "./handlers/myGroups.handler.js";
import myGroupHandler from "./handlers/myGroup.handler.js";
import myPaymentsHandler from "./handlers/myPayments.handler.js";
import groupStudentsHandler from "./handlers/groupStudents.handler.js";
import teacherAttendanceHandler from "./handlers/teacherAttendance.handler.js";
import myAttendanceHandler from "./handlers/myAttendance.handler.js";
import mySalaryHandler from "./handlers/mySalary.handler.js";
import scheduleHandler from "./handlers/schedule.handler.js";
import feedbackEntryHandler, {
  feedbackCallbackHandler,
  feedbackTextHandler,
} from "./handlers/feedbackBot.handler.js";
import cancelHandler from "./handlers/cancel.handler.js";

// Reply keyboard tugmalari (text step handler bularni inkor etadi)
const KNOWN_BUTTONS = new Set([
  "Yordam",
  "Mening guruhlarim",
  "Mening guruhim",
  "Mening to'lovlarim",
  "Davomat",
  "Davomatim",
  "Oyligim",
  "Dars jadvali",
  "Feedback",
]);

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

const safeCallback = (bot, fn) => async (query) => {
  try {
    await fn(bot, query);
  } catch (err) {
    logger.error({ err }, "Bot callback xatosi");
    try {
      await bot.answerCallbackQuery(query.id, { text: "Xatolik" });
    } catch {
      /* noop */
    }
  }
};

export const registerHandlers = (bot) => {
  // /commands
  bot.onText(/^\/start(?:\s|$)/, safe(bot, startHandler));
  bot.onText(/^\/help(?:\s|$)/, safe(bot, helpHandler));
  bot.onText(/^\/cancel(?:\s|$)/, safe(bot, cancelHandler));

  // Reply keyboard tugmalari
  bot.onText(/^Yordam$/, safe(bot, helpHandler));
  bot.onText(/^Mening guruhlarim$/, safe(bot, myGroupsHandler));
  bot.onText(/^Mening guruhim$/, safe(bot, myGroupHandler));
  bot.onText(/^Mening to'lovlarim$/, safe(bot, myPaymentsHandler));
  bot.onText(/^Davomat$/, safe(bot, teacherAttendanceHandler));
  bot.onText(/^Davomatim$/, safe(bot, myAttendanceHandler));
  bot.onText(/^Oyligim$/, safe(bot, mySalaryHandler));
  bot.onText(/^Dars jadvali$/, safe(bot, scheduleHandler));
  bot.onText(/^Feedback$/, safe(bot, feedbackEntryHandler));

  // Generic message hook (contact + flowState text steps + upsert)
  bot.on("message", async (msg) => {
    if (!msg?.from) return;

    // Contact (telefon ulashish)
    if (msg.contact) {
      await safe(bot, contactHandler)(msg);
      return;
    }

    // /command'lar yuqorida onText orqali ushlanadi
    if (typeof msg.text === "string" && msg.text.startsWith("/")) return;

    // Reply keyboard tugmasi bo'lmagan oddiy matn — flowState text step
    if (msg.text && !KNOWN_BUTTONS.has(msg.text.trim())) {
      try {
        const handled = await feedbackTextHandler(bot, msg);
        if (handled) return;
      } catch (err) {
        logger.error({ err }, "Feedback text step xatosi");
      }
    }

    try {
      await upsertFromTelegram(msg.from, msg.chat.id);
    } catch (err) {
      logger.error({ err }, "BotUser yangilashda xato");
    }
  });

  // Callback queries: students:* (mavjud) + fb:* (yangi)
  bot.on("callback_query", async (query) => {
    const data = String(query?.data || "");
    if (data.startsWith("students:")) {
      await safeCallback(bot, groupStudentsHandler)(query);
      return;
    }
    if (data.startsWith("fb:")) {
      await safeCallback(bot, feedbackCallbackHandler)(query);
      return;
    }
    try {
      await bot.answerCallbackQuery(query.id);
    } catch {
      /* noop */
    }
  });

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Telegram polling xatosi");
  });

  bot.on("webhook_error", (err) => {
    logger.error({ err }, "Telegram webhook xatosi");
  });

  bot.on("error", async (err) => {
    if (err?.response?.statusCode === 403 && err?.response?.body?.from?.id) {
      await markBlocked(err.response.body.from.id, true).catch(() => null);
    }
    logger.error({ err }, "Bot umumiy xato");
  });
};
