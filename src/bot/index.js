import env from "../config/env.js";
import logger from "../config/logger.js";
import { createBot, getBot, destroyBot } from "./config/bot.instance.js";
import { registerHandlers } from "./bot.router.js";

export const startBot = async () => {
  if (!env.TELEGRAM_BOT_ENABLED) {
    logger.info("Telegram bot o'chirilgan (TELEGRAM_BOT_ENABLED=false)");
    return null;
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn("TELEGRAM_BOT_TOKEN bo'sh, bot ishga tushirilmadi");
    return null;
  }

  const bot = createBot();
  registerHandlers(bot);

  await bot.startPolling({ restart: true });

  const me = await bot.getMe();
  logger.info({ username: me.username }, "Telegram bot ishga tushdi");

  await bot.setMyCommands([
    { command: "start", description: "Botni ishga tushirish" },
    { command: "help", description: "Yordam" },
  ]);

  return bot;
};

export const stopBot = async () => {
  const bot = getBot();
  if (!bot) return;
  await bot.stopPolling({ cancel: true }).catch(() => null);
  destroyBot();
  logger.info("Telegram bot to'xtatildi");
};
