import logger from "../config/logger.js";
import startHandler from "./handlers/start.handler.js";
import helpHandler from "./handlers/help.handler.js";

// DIQQAT: bu bot ataylab "WebApp-only" - barcha funksiyalar (davomat, to'lov,
// guruhlar va h.k.) Telegram mini-ilova ichida. Shu sababli handlers/ ichidagi
// myAttendance/teacherAttendance/myPayments/... fayllari ataylab ulanMAGAN.
// Ularni "tuzatish" runtime'ga ta'sir qilmaydi - yoki mini-ilovada ishlang,
// yoki bu yerda command sifatida ro'yxatga oling.

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
  // Bot faqat /start va /help qabul qiladi - qolgan hamma narsa mini ilova ichida.
  bot.onText(/^\/start(?:\s|$)/, safe(bot, startHandler));
  bot.onText(/^\/help(?:\s|$)/, safe(bot, helpHandler));

  // Boshqa har qanday matnga - qisqa eslatma
  bot.on("message", async (msg) => {
    if (!msg?.text) return;
    if (msg.text.startsWith("/")) return; // /start va /help yuqorida ushlanadi
    try {
      await bot.sendMessage(
        msg.chat.id,
        "Tizimga kirish uchun /start ni bosing.",
      );
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

  // Eslatma: bloklangan (403) foydalanuvchilarni belgilash yetkazish nuqtasida
  // (deliverToChat) amalga oshiriladi - u yerda userId/telegramId ma'lum. Bu yerdagi
  // generic error event'da foydalanuvchi identifikatori ishonchli bo'lmaydi.
  bot.on("error", (err) => {
    logger.error({ err }, "Bot umumiy xato");
  });
};
